#!/bin/sh
set -e

echo "-> resolviendo migraciones fallidas previas (si existen)"
npx prisma migrate resolve --applied "20260730000000_init" --schema=server/prisma/schema.prisma 2>/dev/null || true

echo "-> aplicando migraciones de Prisma"
if ! npx prisma migrate deploy --schema=server/prisma/schema.prisma; then
  echo "-> migrate deploy falló, intentando db push con --accept-data-loss"
  npx prisma db push --accept-data-loss --schema=server/prisma/schema.prisma || {
    echo "-> db push también falló, continuando de todos modos"
  }
fi

echo "-> sembrando datos base (idempotente)"
node server/prisma/seed.js || echo "-> seed falló (continuando)"

echo "-> arrancando API"
exec node server/src/index.js
