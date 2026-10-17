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

test('el arranque no cae a db push --accept-data-loss', () => {
  // El error de C3: si `migrate deploy` fallaba, el script ejecutaba
  // `prisma db push --accept-data-loss`, que "arregla" el esquema borrando
  // columnas y tablas con datos. La cadena sí aparece en el comentario que
  // explica por qué NO se usa, así que se buscan comandos, no menciones.
  assert.doesNotMatch(entrada, /^\s*npx prisma db push\b/m)
  assert.doesNotMatch(entrada, /^\s*prisma db push\b/m)
})

test('el arranque no marca migraciones como aplicadas a ciegas', () => {
  // `migrate resolve --applied <init>` sin mirar el estado hacía que, en una
  // base nueva, `migrate deploy` saltara el init y fallara con las siguientes.
  assert.doesNotMatch(entrada, /^\s*npx prisma migrate resolve\b/m)
  assert.doesNotMatch(entrada, /^\s*prisma migrate resolve\b/m)
})

test('si las migraciones fallan, el arranque se detiene', () => {
  assert.match(entrada, /if ! npx prisma migrate deploy/, 'debe comprobar el resultado de migrate deploy')
  // Tras el fallo no debe seguir arrancando la API: tiene que salir con error.
  assert.match(entrada, /deploy' fallo[\s\S]*?exit 1/, 'debe salir con error si migrate deploy falla')
})

test('el entrypoint viaja con LF: un CRLF rompe el shebang', () => {
  assert.match(entrada, /^#!\/bin\/sh\n/)
  assert.doesNotMatch(entrada, /\r/, 'no debe haber retornos de carro')
})

test('git conserva LF en los scripts de shell', () => {
  const attrs = fs.readFileSync(fileURLToPath(new URL('../../.gitattributes', import.meta.url)), 'utf8')
  assert.match(attrs, /\*\.sh\s+text\s+eol=lf/)
})
