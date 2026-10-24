import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Guardas del arranque del contenedor. No se puede lanzar el entrypoint aquí
 * (requiere una base y arranca la API), pero sí comprobar que no ha vuelto la
 * trampa que borraba datos.
 */
const entrada = fs.readFileSync(fileURLToPath(new URL('../entrypoint.sh', import.meta.url)), 'utf8')
const resolver = fs.readFileSync(
  fileURLToPath(new URL('../prisma/resolve-failed-migration.cjs', import.meta.url)),
  'utf8'
)

test('el arranque no cae a db push --accept-data-loss', () => {
  // El error de C3: si `migrate deploy` fallaba, el script ejecutaba
  // `prisma db push --accept-data-loss`, que "arregla" el esquema borrando
  // columnas y tablas con datos. La cadena sí aparece en el comentario que
  // explica por qué NO se usa, así que se buscan comandos, no menciones.
  assert.doesNotMatch(entrada, /^\s*npx prisma db push\b/m)
  assert.doesNotMatch(entrada, /^\s*prisma db push\b/m)
  assert.doesNotMatch(resolver, /prisma db push/)
})

test('el arranque no marca migraciones como aplicadas a ciegas', () => {
  // `migrate resolve --applied <init>` sin mirar el estado hacía que, en una
  // base nueva, `migrate deploy` saltara el init y fallara con las siguientes.
  // Ahora la resolución está en un script aparte que consulta information_schema
  // antes de decidir si aplica o hace rollback.
  assert.doesNotMatch(entrada, /^\s*npx prisma migrate resolve\b/m)
  assert.doesNotMatch(entrada, /^\s*prisma migrate resolve\b/m)
})

test('el script de resolucion verifica el esquema antes de migrate resolve', () => {
  assert.match(resolver, /information_schema/)
  assert.match(resolver, /migrate resolve/)
})

test('el arranque delega la migracion en el script de resolucion', () => {
  assert.match(
    entrada,
    /node server\/prisma\/resolve-failed-migration\.cjs/,
    'debe invocar el script de resolucion'
  )
})

test('si las migraciones fallan, el arranque se detiene', () => {
  assert.match(
    entrada,
    /if ! node server\/prisma\/resolve-failed-migration\.cjs/,
    'debe comprobar el resultado del script de migracion'
  )
  // Tras el fallo no debe seguir arrancando la API: tiene que salir con error.
  assert.match(
    entrada,
    /ERROR: no se pudieron aplicar las migraciones[\s\S]*?exit 1/,
    'debe salir con error si el script falla'
  )
})

test('el entrypoint viaja con LF: un CRLF rompe el shebang', () => {
  assert.match(entrada, /^#!\/bin\/sh\n/)
  assert.doesNotMatch(entrada, /\r/, 'no debe haber retornos de carro')
})

test('git conserva LF en los scripts de shell', () => {
  const attrs = fs.readFileSync(fileURLToPath(new URL('../../.gitattributes', import.meta.url)), 'utf8')
  assert.match(attrs, /\*\.sh\s+text\s+eol=lf/)
})
