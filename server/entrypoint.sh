#!/bin/sh
set -e

SCHEMA=server/prisma/schema.prisma

# ---------------------------------------------------------------------------
# Esperar a la base de datos.
#
# Sin esto, si la base todavía no está lista en el momento de arrancar,
# `migrate deploy` falla y el arranque se detiene, aunque el problema fuera solo
# una conexión tardía. Es la causa más frecuente de un despliegue que parece bien
# y no lo está.
# ---------------------------------------------------------------------------
echo "-> esperando a la base de datos"
node -e '
const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
(async () => {
  for (let i = 1; i <= 30; i++) {
    try {
      await p.$queryRaw`SELECT 1`;
      console.log(`   base disponible (intento ${i})`);
      await p.$disconnect();
      process.exit(0);
    } catch (e) {
      if (i === 30) {
        console.error("   la base no respondio tras 30 intentos");
        await p.$disconnect().catch(() => {});
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
})();
' || {
  echo "-> ERROR: no hay base de datos. No se arranca para no operar con un esquema desconocido."
  exit 1
}

# ---------------------------------------------------------------------------
# Aplicar las migraciones.
#
# Si `migrate deploy` falla con P3009 (migracion fallida en la base), el script
# de resolucion auto-detecta la migracion, verifica si sus cambios ya existen
# en el esquema (CREATE TABLE / ADD COLUMN) y marca la migracion como aplicada
# o rollback segun corresponda. Luego reintenta `migrate deploy`.
#
# Esto evita que un reinicio del contenedor a mitad de una migracion deje la
# base bloqueada para siempre, sin recurrir a `db push --accept-data-loss`.
# Solo se auto-resuelven migraciones de CREATE TABLE o ADD COLUMN; cualquier
# otro tipo de fallo detiene el arranque para revision manual.
# ---------------------------------------------------------------------------
echo "-> aplicando migraciones de Prisma"
if ! node server/prisma/resolve-failed-migration.cjs; then
  echo "-> ERROR: no se pudieron aplicar las migraciones. Abortando."
  exit 1
fi

echo "-> sembrando datos base (idempotente)"
node server/prisma/seed.js || echo "-> seed fallo (continuando)"

echo "-> arrancando API"
exec node server/src/index.js