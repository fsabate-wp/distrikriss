#!/bin/sh
set -e

SCHEMA=server/prisma/schema.prisma

# ---------------------------------------------------------------------------
# Esperar a la base de datos.
#
# Sin esto, si la base todavía no está lista en el momento de arrancar,
# `migrate deploy` falla y el script cae al `db push --accept-data-loss` de
# abajo, que puede borrar datos para "arreglar" un problema que era solo una
# conexión tardía. Es la causa más frecuente de un despliegue que parece bien y
# deja el esquema en cualquier cosa.
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

echo "-> resolviendo migraciones fallidas previas (si existen)"
npx prisma migrate resolve --applied "20260730000000_init" --schema="$SCHEMA" 2>/dev/null || true

echo "-> aplicando migraciones de Prisma"
if ! npx prisma migrate deploy --schema="$SCHEMA"; then
  echo "-> AVISO: migrate deploy fallo. Intentando db push con --accept-data-loss."
  echo "-> AVISO: revisar el esquema antes de confiar en esta base."
  npx prisma db push --accept-data-loss --schema="$SCHEMA" || {
    echo "-> ERROR: db push tambien fallo. El servidor arrancara igual, pero con el"
    echo "->        esquema que hubiera. Revisa las migraciones antes de abrir la tienda."
  }
fi

echo "-> sembrando datos base (idempotente)"
node server/prisma/seed.js || echo "-> seed fallo (continuando)"

echo "-> arrancando API"
exec node server/src/index.js