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
# Antes, si `migrate deploy` fallaba por cualquier motivo (una conexion a medias,
# un drift, una migracion a medio aplicar) el script caia a
# `db push --accept-data-loss`, que "arregla" el esquema BORRANDO columnas y
# tablas con datos, y ademas arrancaba la API aunque el push tambien fallara. Un
# fallo de despliegue se convertia en perdida silenciosa de datos.
#
# Ahora un fallo detiene el arranque: es preferible que el contenedor no levante
# y alguien mire las migraciones, a que la tienda siga vendiendo con el esquema a
# medias o con datos borrados. Para inspeccionar el estado:
#   npx prisma migrate status --schema=server/prisma/schema.prisma
#
# Tampoco se marca la migracion inicial como aplicada a ciegas: eso hacia que en
# una base nueva `migrate deploy` saltara el init y fallara con las siguientes.
# ---------------------------------------------------------------------------
echo "-> aplicando migraciones de Prisma"
if ! npx prisma migrate deploy --schema="$SCHEMA"; then
  echo "-> ERROR: 'migrate deploy' fallo. No se arranca con un esquema desconocido."
  echo "->        Revisa: npx prisma migrate status --schema=$SCHEMA"
  echo "->        NO se ejecuta 'db push --accept-data-loss': borraria datos."
  exit 1
fi

echo "-> sembrando datos base (idempotente)"
node server/prisma/seed.js || echo "-> seed fallo (continuando)"

echo "-> arrancando API"
exec node server/src/index.js