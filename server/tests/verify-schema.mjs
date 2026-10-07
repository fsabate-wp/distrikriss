import { prisma } from '../src/lib/prisma.js'

/**
 * Verificacion del esquema nuevo (tras aplicar la migracion de endurecimiento).
 *
 * Comprueba que la migracion de la contrasena en claro a la cifrada dejo la base
 * en el estado esperado y que el sistema sigue able de leer, escribir y rotar
 * el secreto.
 */

const SECRET = 'clave-de-rotacion-0000000000000000000000abcd'

process.env.SRI_CERT_SECRET = SECRET

const { encryptSecret, decryptSecret, isEncrypted } = await import('../src/lib/crypto.js')

let fallos = 0
let n = 0

function check(nombre, ok, detalle = '') {
  n += 1
  if (ok) console.log(`  ok    ${nombre}`)
  else {
    fallos += 1
    console.log(`  FALLA ${nombre}${detalle ? ` -> ${detalle}` : ''}`)
  }
}

async function main() {
  console.log('\n=== 1. El esquema nuevo no tiene la columna en claro ===')
  const columnas = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'Settings' AND column_name LIKE 'sriCertificatePassword%'
    ORDER BY column_name
  `
  const nombres = columnas.map((c) => c.column_name).sort()
  check('la columna en claro ya no existe', !nombres.includes('sriCertificatePassword'), nombres.join(', '))
  check('existe la columna cifrada', nombres.includes('sriCertificatePasswordEnc'), nombres.join(', '))

  console.log('\n=== 2. Se puede guardar y leer la contrasena cifrada ===')
  const claveTexto = 'MiClaveSecreta-2026!'
  const cifrado = encryptSecret(claveTexto)
  await prisma.settings.update({
    where: { id: 1 },
    data: { sriCertificatePasswordEnc: cifrado, sriCertificatePasswordFor: 'cert-test.p12' },
  })
  const leida = await prisma.settings.findUnique({ where: { id: 1 } })
  check('lo que sale de la base esta cifrado', isEncrypted(leida.sriCertificatePasswordEnc))
  check('el texto plano no aparece en la base', !JSON.stringify(leida).includes(claveTexto))
  check('al leer se recupera el valor exacto', decryptSecret(leida.sriCertificatePasswordEnc) === claveTexto)

  console.log('\n=== 3. Cifrar dos veces da ciphertext distinto pero equivalente ===')
  const otroCifrado = encryptSecret(claveTexto)
  check('cifrar con la misma clave da un ciphertext distinto', otroCifrado !== cifrado)
  check('pero descifra al mismo texto', decryptSecret(otroCifrado) === claveTexto)

  console.log('\n=== 4. El estado del comprobante es un enum, no texto libre ===')
  const tipoEstado = await prisma.$queryRaw`
    SELECT data_type, udt_name FROM information_schema.columns
    WHERE table_name = 'Invoice' AND column_name = 'status'
  `
  check('status es de tipo enumerado', tipoEstado[0]?.udt_name === 'InvoiceStatus',
    `udt_name=${tipoEstado[0]?.udt_name}`)

  console.log('\n=== 5. Existen las tablas de auditoria ===')
  for (const tabla of ['InvoiceEvent', 'AuditLog', 'DocumentSeries']) {
    const existe = await prisma.$queryRawUnsafe(
      `SELECT to_regclass('public."${tabla}"') IS NOT NULL AS ok`,
    )
    check(`existe ${tabla}`, existe[0]?.ok === true)
  }

  console.log('\n=== 6. La clave de acceso y la serie son unicas ===')
  const indices = await prisma.$queryRaw`
    SELECT indexname FROM pg_indexes WHERE tablename = 'Invoice'
  `
  const lista = indices.map((i) => i.indexname)
  check('accessKey es unico', lista.includes('Invoice_accessKey_key'), lista.join(', '))
  check('(tipo, establec., pto., sec.) es unico',
    lista.includes('Invoice_docType_establishment_emissionPoint_sequential_key'))

  console.log('\n=== 7. El precio del item guarda el descuento aplicado ===')
  const columnasItem = await prisma.$queryRaw`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'OrderItem' AND column_name IN ('discountPct', 'listPrice', 'sriCode')
    ORDER BY column_name
  `
  const colsItem = columnasItem.map((c) => c.column_name)
  check('OrderItem.discountPct existe', colsItem.includes('discountPct'), colsItem.join(', '))
  check('OrderItem.listPrice existe', colsItem.includes('listPrice'), colsItem.join(', '))
  check('OrderItem.sriCode existe', colsItem.includes('sriCode'), colsItem.join(', '))

  console.log('\n=== 8. Limpieza ===')
  await prisma.settings.update({
    where: { id: 1 },
    data: { sriCertificatePasswordEnc: '', sriCertificatePasswordFor: '' },
  })
  console.log('  contrasena de prueba borrada')

  console.log(`\n=== Resultado: ${n - fallos}/${n} comprobaciones ===`)
  if (fallos) process.exitCode = 1
}

main()
  .catch((err) => {
    console.error('\n*** fallo la verificacion de esquema ***')
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
