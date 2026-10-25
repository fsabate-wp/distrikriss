const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');

const SCHEMA = 'server/prisma/schema.prisma';

function run(cmd) {
  try {
    const output = execSync(cmd, {
      encoding: 'utf-8',
      maxBuffer: 10 * 1024 * 1024,
    });
    console.log(output);
    return { success: true, output: output || '' };
  } catch (e) {
    const out = (e.stdout || '') + (e.stderr || '');
    console.log(out);
    return { success: false, output: out, code: e.status };
  }
}

/**
 * Extrae todos los objetos que crea una migracion SQL:
 * - CREATE TYPE name
 * - CREATE TABLE name
 * - ALTER TABLE table ADD COLUMN column
 */
function extractObjects(sql) {
  const types = [];
  const tables = [];
  const columns = [];

  // CREATE TYPE "Name" AS ENUM ...
  const typeRegex = /CREATE TYPE\s+"([^"]+)"\s+AS\s+ENUM/gi;
  let m;
  while ((m = typeRegex.exec(sql)) !== null) {
    types.push(m[1]);
  }

  // CREATE TABLE "Name" (
  const tableRegex = /CREATE TABLE\s+"([^"]+)"\s*\(/gi;
  while ((m = tableRegex.exec(sql)) !== null) {
    tables.push(m[1]);
  }

  // ALTER TABLE "Table" ADD COLUMN "column" ...
  // Soporta: ADD COLUMN "col" ..., ADD COLUMN     "col" ..., ADD COLUMN "col""type" ..., etc.
  const addColRegex = /ALTER TABLE\s+"([^"]+)"\s+ADD COLUMN\s+"?([a-zA-Z0-9_]+)"?/gi;
  while ((m = addColRegex.exec(sql)) !== null) {
    columns.push({ table: m[1], column: m[2] });
  }

  return { types, tables, columns };
}

async function main() {
  console.log('-> aplicando migraciones de Prisma');

  let deploy = run(`npx prisma migrate deploy --schema="${SCHEMA}"`);
  if (deploy.success) {
    console.log('-> migraciones aplicadas correctamente');
    return 0;
  }

  const fullOutput = deploy.output;
  if (!fullOutput.includes('P3009')) {
    console.error('-> ERROR: no es un error de migracion fallida (P3009). Abortando.');
    return 1;
  }

  console.log('-> WARNING: migrate deploy fallo por migracion fallida. Analizando...');

  // 1. Detectar la migracion fallida consultando _prisma_migrations
  const prisma = new PrismaClient();
  let failedMigration;
  try {
    const rows = await prisma.$queryRaw`
      SELECT migration_name
      FROM _prisma_migrations
      WHERE started_at IS NOT NULL
        AND finished_at IS NULL
        AND rolled_back_at IS NULL
      ORDER BY started_at DESC
      LIMIT 1
    `;
    if (!rows || rows.length === 0) {
      console.error('-> ERROR: no se encontro migracion fallida en _prisma_migrations.');
      return 1;
    }
    failedMigration = rows[0].migration_name;
  } finally {
    await prisma.$disconnect();
  }

  console.log(`-> Migracion fallida detectada: ${failedMigration}`);

  const migrationFile = path.join('server/prisma/migrations', failedMigration, 'migration.sql');
  if (!fs.existsSync(migrationFile)) {
    console.error(`-> ERROR: no se encontro ${migrationFile}`);
    return 1;
  }

  const sql = fs.readFileSync(migrationFile, 'utf-8');
  const objects = extractObjects(sql);

  console.log(`   Objetos en la migracion: ${objects.types.length} types, ${objects.tables.length} tables, ${objects.columns.length} columns`);

  if (objects.types.length === 0 && objects.tables.length === 0 && objects.columns.length === 0) {
    console.error('-> ERROR: la migracion no contiene CREATE TYPE, CREATE TABLE ni ADD COLUMN. No se auto-resuelve.');
    return 1;
  }

  // 2. Verificar que existan en la base de datos
  const prisma2 = new PrismaClient();
  const missing = [];
  try {
    for (const typeName of objects.types) {
      const result = await prisma2.$queryRaw`
        SELECT 1 FROM pg_type WHERE typname = ${typeName}
      `;
      if (result.length === 0) {
        missing.push(`TYPE ${typeName}`);
      }
    }

    for (const tableName of objects.tables) {
      const result = await prisma2.$queryRaw(
        Prisma.sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`
      );
      if (result.length === 0) {
        missing.push(`TABLE ${tableName}`);
      }
    }

    for (const { table, column } of objects.columns) {
      const result = await prisma2.$queryRaw(
        Prisma.sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`
      );
      if (result.length === 0) {
        missing.push(`COLUMN ${table}.${column}`);
      }
    }
  } finally {
    await prisma2.$disconnect();
  }

  // 3. Decidir la accion
  if (missing.length === 0) {
    console.log('-> Todos los objetos de la migracion existen. Marcando como aplicada...');
    const resolve = run(
      `npx prisma migrate resolve --applied "${failedMigration}" --schema="${SCHEMA}"`
    );
    if (!resolve.success) {
      console.error('-> ERROR: migrate resolve --applied fallo.');
      return 1;
    }
  } else if (missing.length === objects.types.length + objects.tables.length + objects.columns.length) {
    console.log('-> Ningun objeto de la migracion existe. Marcando como rollback...');
    const resolve = run(
      `npx prisma migrate resolve --rolled-back "${failedMigration}" --schema="${SCHEMA}"`
    );
    if (!resolve.success) {
      console.error('-> ERROR: migrate resolve --rolled-back fallo.');
      return 1;
    }
  } else {
    console.error('-> ERROR: estado parcial. Algunos objetos existen y otros no:');
    for (const item of missing) {
      console.error(`   FALTA: ${item}`);
    }
    console.error('-> Requiere intervencion manual.');
    return 1;
  }

  console.log('-> Reintentando migrate deploy...');
  deploy = run(`npx prisma migrate deploy --schema="${SCHEMA}"`);
  if (!deploy.success) {
    console.error('-> ERROR: migrate deploy fallo de nuevo despues de resolver.');
    return 1;
  }

  console.log('-> migraciones aplicadas correctamente tras reparacion');
  return 0;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
