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

  const status = run(`npx prisma migrate status --schema="${SCHEMA}"`);
  const statusText = status.output;

  const match = statusText.match(/The `([0-9]+_[a-zA-Z0-9_]+)` migration/);
  if (!match) {
    console.error('-> ERROR: no se pudo identificar la migracion fallida.');
    console.error(statusText);
    return 1;
  }

  const failedMigration = match[1];
  console.log(`-> Migracion fallida detectada: ${failedMigration}`);

  const migrationFile = path.join('server/prisma/migrations', failedMigration, 'migration.sql');
  if (!fs.existsSync(migrationFile)) {
    console.error(`-> ERROR: no se encontro ${migrationFile}`);
    return 1;
  }

  const sql = fs.readFileSync(migrationFile, 'utf-8');

  const createTableRegex = /CREATE TABLE "([^"]+)"\s*\(/gi;
  const addColumnRegex = /ALTER TABLE "([^"]+)" ADD COLUMN "?([a-zA-Z0-9_]+)"?/gi;

  const createMatches = [...sql.matchAll(createTableRegex)];
  const addMatches = [...sql.matchAll(addColumnRegex)];

  if (createMatches.length > 0 && addMatches.length > 0) {
    console.error('-> ERROR: migracion mixta (CREATE TABLE + ADD COLUMN). No se auto-resuelve.');
    return 1;
  }

  if (createMatches.length === 0 && addMatches.length === 0) {
    console.error('-> ERROR: solo se auto-resuelven migraciones de CREATE TABLE o ADD COLUMN.');
    return 1;
  }

  const prisma = new PrismaClient();
  try {
    let allExist = true;
    let noneExist = true;

    if (createMatches.length > 0) {
      for (const m of createMatches) {
        const table = m[1];
        console.log(`   Verificando tabla ${table}...`);
        const result = await prisma.$queryRaw(
          Prisma.sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}`
        );
        if (result.length > 0) {
          noneExist = false;
        } else {
          allExist = false;
        }
      }
    } else {
      for (const m of addMatches) {
        const table = m[1];
        const column = m[2];
        console.log(`   Verificando columna ${table}.${column}...`);
        const result = await prisma.$queryRaw(
          Prisma.sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`
        );
        if (result.length > 0) {
          noneExist = false;
        } else {
          allExist = false;
        }
      }
    }

    if (allExist) {
      console.log('-> Todos los objetos existen. Marcando migracion como aplicada...');
      const resolve = run(
        `npx prisma migrate resolve --applied "${failedMigration}" --schema="${SCHEMA}"`
      );
      if (!resolve.success) {
        console.error('-> ERROR: migrate resolve --applied fallo.');
        return 1;
      }
    } else if (noneExist) {
      console.log('-> Ningun objeto existe. Marcando migracion como rollback...');
      const resolve = run(
        `npx prisma migrate resolve --rolled-back "${failedMigration}" --schema="${SCHEMA}"`
      );
      if (!resolve.success) {
        console.error('-> ERROR: migrate resolve --rolled-back fallo.');
        return 1;
      }
    } else {
      console.error('-> ERROR: estado parcial. Requiere intervencion manual.');
      return 1;
    }
  } finally {
    await prisma.$disconnect();
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
