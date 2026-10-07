import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'

process.env.DATABASE_URL ||= 'postgresql://distrikriss:distrikriss@localhost:5432/distrikriss?schema=public'
process.env.SRI_CERT_SECRET = 'c'.repeat(64)

const raiz = 'C:/Users/USER/Desktop/distrikriss'
const dir = path.join(raiz, 'server/prisma/migrations')
const respaldo = 'C:/Users/USER/AppData/Local/Temp/opencode/mig-backup'
const nuevas = ['20261006120000_sri_security_hardening', '20261007120000_order_sequence_and_bank_encryption']

function prisma(args) {
  return execSync(`npx prisma ${args} --schema=server/prisma/schema.prisma`, {
    cwd: raiz,
    encoding: 'utf8',
    env: { ...process.env },
  })
}

function sql(texto) {
  return execSync('docker exec -i distrikriss-db psql -U distrikriss -d distrikriss -t -A -v ON_ERROR_STOP=1 -f -', {
    input: texto,
    encoding: 'utf8',
    shell: 'C:\\Program Files\\Git\\bin\\bash.exe',
  })
}

console.log('\n=== 1. Base en el estado de produccion actual (9 migraciones) ===')
fs.rmSync(respaldo, { recursive: true, force: true })
fs.mkdirSync(respaldo, { recursive: true })
for (const m of nuevas) {
  const origen = path.join(dir, m)
  fs.cpSync(origen, path.join(respaldo, m), { recursive: true })
  fs.rmSync(origen, { recursive: true, force: true })
}
prisma('migrate reset --force --skip-seed --skip-generate')
console.log('  ok')

console.log('\n=== 2. Tienda con pedidos, facturas y certificado en claro ===')
sql(`
INSERT INTO "User" ("id","name","phone","email","passwordHash","role","active","createdAt","updatedAt")
VALUES ('u1','Admin','0999999999','admin@distrikriss.com','x','ADMIN',true,NOW(),NOW());
INSERT INTO "Category" ("id","name","slug","sortOrder","active","createdAt")
VALUES ('c1','Verduras','verduras',0,true,NOW());
INSERT INTO "Product" ("id","slug","name","price","unit","minQuantity","stepQuantity","stock",
  "discount","featured","active","categoryId","createdAt","updatedAt")
VALUES ('p1','papa','Papa',2.50,'Kilo',0.5,0.5,50,15,false,true,'c1',NOW(),NOW());
INSERT INTO "Order" ("id","code","userId","status","paymentMethod","paymentStatus","subtotal",
  "deliveryFee","total","deliveryDate","slotId","slotLabel","addressSnapshot","billingType","billingData",
  "createdAt","updatedAt")
VALUES ('o1','DK-0001','u1','DELIVERED','TRANSFER','PAID',2.12,2.00,4.12,NOW(),'man','Mañana',
  '{"street":"Av. Amazonas","city":"Quito"}','FACTURA','{"id":"1791312120001","name":"CLIENTE SA"}',NOW(),NOW());
INSERT INTO "OrderItem" ("id","orderId","productId","name","unit","price","quantity","ivaRate")
VALUES ('oi1','o1','p1','Papa','Kilo',2.50,1,15);
INSERT INTO "Invoice" ("id","orderId","establishment","emissionPoint","sequential","number","accessKey",
  "status","xml","authorizationNumber","authorizationDate","createdAt","updatedAt")
VALUES ('i1','o1','003','001',1,'003-001-000000001',
  '0610202601179131212000120030010000000011234567814','AUTHORIZED','<factura/>','1234567890',NOW(),NOW(),NOW());
INSERT INTO "Order" ("id","code","userId","status","paymentMethod","paymentStatus","subtotal",
  "deliveryFee","total","deliveryDate","slotId","slotLabel","addressSnapshot","billingType","billingData",
  "createdAt","updatedAt")
VALUES ('o2','DK-0002','u1','PENDING','COD','PENDING',2.12,2.00,4.12,NOW(),'tarde','Tarde',
  '{"street":"Av. Amazonas","city":"Quito"}','FACTURA','{"id":"1712345678","name":"JUAN PEREZ"}',NOW(),NOW());
INSERT INTO "Invoice" ("id","orderId","establishment","emissionPoint","sequential","number","accessKey",
  "status","xml","createdAt","updatedAt")
VALUES ('i2','o2','003','001',2,'003-001-000000002',
  '0610202601179131212000120030010000000021234567814','PENDING','<factura/>',NOW(),NOW());
INSERT INTO "DeliveryZone" ("id","name","color","polygon","enabled","deliveryDays","slots",
  "deliveryFeeBase","deliveryFeePerKm","minOrderAmount","sortOrder","createdAt","updatedAt")
VALUES ('z1','Centro','#4CAF50',
  '{"type":"Polygon","coordinates":[[[-79.9,-2.2],[-79.9,-2.18],[-79.88,-2.18],[-79.88,-2.2],[-79.9,-2.2]]]}',
  true,'[0,1,2,3,4,5,6]','[{"id":"man","label":"Mañana","start":"09:00","end":"12:00","capacity":3}]',
  2,0.5,5,0,NOW(),NOW());
INSERT INTO "Settings" ("id","storeName","storeLat","storeLng","deliveryDays","openHours","slots",
  "bankTransfer","ruc","businessName","sriEnabled","sriEnvironment","sriCertificateFile",
  "sriCertificatePassword","sriIvaRate","updatedAt")
VALUES (1,'DistriKriss',-2.19,-79.89,'[0,1,2,3,4,5,6]','{}','[]',
  '{"bank":"Banco X","accountNumber":"1234567890"}','1791312120001','DISTRIKRISS SA',true,2,
  'cert-1759800000000-0011223344556677.p12','CONTRASENA-EN-CLARO',15,NOW());
`)
console.log('  2 pedidos, 2 facturas, 1 zona con horario, contrasena en claro')

console.log('\n=== 3. Push: restaurar las migraciones ===')
for (const m of nuevas) fs.cpSync(path.join(respaldo, m), path.join(dir, m), { recursive: true })

console.log('\n=== 4. migrate deploy (lo que hace entrypoint.sh) ===')
let ok = true
try {
  prisma('migrate deploy')
  console.log('  OK')
} catch (err) {
  ok = false
  console.log(`  FALLO:\n${(err.stdout || '') + (err.stderr || '')}`)
}

console.log('\n=== 5. Datos y estructura ===')
const consultas = [
  ['pedidos', sql('SELECT count(*) FROM "Order";')],
  ['facturas', sql('SELECT count(*) FROM "Invoice";')],
  ['importe pedido 1', sql("SELECT total FROM \"Order\" WHERE id='o1';")],
  ['autorizacion factura 1', sql("SELECT \"authorizationNumber\" FROM \"Invoice\" WHERE id='i1';")],
  ['estado PENDING -> DRAFT', sql("SELECT status FROM \"Invoice\" WHERE id='i2';")],
  ['ambiente backfilled', sql("SELECT string_agg(DISTINCT environment::text, ',') FROM \"Invoice\";")],
  ['RUC conservado', sql('SELECT ruc FROM "Settings" WHERE id=1;')],
  ['cont. en claro eliminada', sql(`SELECT CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Settings' AND column_name='sriCertificatePassword') THEN 'NO' ELSE 'si' END;`)],
  ['correlativo pedido sembrado', sql(`SELECT value FROM "OrderSequence" WHERE id='order-code';`)],
  ['SlotLock desde la zona', sql('SELECT count(*) FROM "SlotLock";')],
  ['indice serie unico', sql(`SELECT CASE WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname='Invoice_docType_establishment_emissionPoint_sequential_key') THEN 'si' ELSE 'FALTA' END;`)],
]
for (const [que, valor] of consultas) console.log(`  ${que}: ${String(valor).trim()}`)

console.log('\n=== 6. El arranque con estos datos ===')
const { prisma: db } = await import('../src/lib/prisma.js')
const { ensureOrderCodeSequence, generateOrderCode } = await import('../src/routes/orders.routes.js')
const { ensureSlotLocks } = await import('../src/lib/delivery.js')
const { inspectCertificate } = await import('../src/lib/sri/cert.js')
await ensureOrderCodeSequence()
const locks = await ensureSlotLocks()
const codigo = await generateOrderCode()
console.log(`  correlativo sembrado, siguiente código: ${codigo}`)
console.log(`  filas de bloqueo nuevas creadas: ${locks} (la zona ya tenia la suya)`)

// El certificado no tiene contrasena migrada: la tienda debe seguir operando y
// el panel debe decirlo con claridad, sin tumbar el arranque.
const settings = await db.settings.findUnique({ where: { id: 1 } })
const info = inspectCertificate(settings)
console.log(`  facturación activada en el panel: ${settings.sriEnabled}`)
console.log(`  certificado: ${info.ok ? 'correcto' : info.error}`)
if (!info.ok) {
  console.log('  -> la tienda sigue vendiendo; solo la emision queda pausada')
  console.log('  -> el operador reintroduce la contrasena en Configuracion > Facturacion')
}

// Y debe volver a funcionar en cuanto se reintroduce.
const { encryptSecret } = await import('../src/lib/crypto.js')
await db.settings.update({
  where: { id: 1 },
  data: {
    sriCertificatePasswordEnc: encryptSecret('CONTRASENA-EN-CLARO'),
    sriCertificatePasswordFor: settings.sriCertificateFile,
  },
})
const despues = inspectCertificate(await db.settings.findUnique({ where: { id: 1 } }))
console.log(`  tras reintroducir la contrasena: ${despues.ok ? 'certificado operativo' : despues.error}`)

await db.order.deleteMany({ where: { id: 'o1' } })
await db.order.deleteMany({ where: { id: 'o2' } })

console.log(`\nRESULTADO: ${ok ? 'despliegue OK, datos conservados' : 'FALLÓ'}`)
if (!ok) process.exitCode = 1