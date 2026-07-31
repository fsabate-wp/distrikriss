#!/bin/sh
set -e

echo "-> aplicando migraciones de Prisma"
npx prisma migrate deploy --schema=server/prisma/schema.prisma || {
  echo "-> migrate deploy falló, usando db push"
  npx prisma db push --schema=server/prisma/schema.prisma
}

echo "-> sembrando datos base (idempotente)"
node server/prisma/seed.js

echo "-> arrancando API"
exec node server/src/index.js
