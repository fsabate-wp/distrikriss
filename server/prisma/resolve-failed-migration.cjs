const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { PrismaClient, Prisma } = require('@prisma/client');

const SCHEMA = 'server/prisma/schema.prisma';
const MIGRATIONS_DIR = 'server/prisma/migrations';

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
 * Ejecuta el SQL de una migracion de forma idempotente.
 * Devuelve true si se pudo ejecutar todo, false si hay un error no manejable.
 */
async function executeMigrationIdempotent(prisma, migrationSql, migrationName) {
  console.log(`   Ejecutando SQL de forma idempotente...`);

  // Dividir en statements individuales (separados por ; al final de linea)
  const statements = migrationSql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'));

  for (const stmt of statements) {
    const lower = stmt.toLowerCase();

    // CREATE TABLE -> IF NOT EXISTS
    if (lower.startsWith('create table')) {
      const tableMatch = stmt.match(/create table\s+"?([a-zA-Z0-9_]+)"?/i);
      if (tableMatch) {
        const tableName = tableMatch[1];
        const exists = await prisma.$queryRaw(
          Prisma.sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`
        );
        if (exists.length > 0) {
          console.log(`      tabla ${tableName} ya existe, saltando`);
          continue;
        }
      }
    }

    // CREATE TYPE -> capturar error si ya existe
    if (lower.startsWith('create type')) {
      const typeMatch = stmt.match(/create type\s+"?([a-zA-Z0-9_]+)"?/i);
      if (typeMatch) {
        const typeName = typeMatch[1];
        const exists = await prisma.$queryRaw`
          SELECT 1 FROM pg_type WHERE typname = ${typeName}
        `;
        if (exists.length > 0) {
          console.log(`      tipo ${typeName} ya existe, saltando`);
          continue;
        }
      }
    }

    // ALTER TABLE ADD COLUMN -> IF NOT EXISTS
    if (lower.includes('add column') && !lower.includes('if not exists')) {
      const colMatch = stmt.match(/alter table\s+"?([a-zA-Z0-9_]+)"?\s+add column\s+"?([a-zA-Z0-9_]+)"?/i);
      if (colMatch) {
        const tableName = colMatch[1];
        const colName = colMatch[2];
        const exists = await prisma.$queryRaw(
          Prisma.sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${colName}`
        );
        if (exists.length > 0) {
          console.log(`      columna ${tableName}.${colName} ya existe, saltando`);
          continue;
        }
      }
    }

    // ALTER COLUMN TYPE -> verificar tipo actual
    if (lower.includes('alter column') && lower.includes('type')) {
      const typeMatch = stmt.match(/alter table\s+"?([a-zA-Z0-9_]+)"?\s+alter column\s+"?([a-zA-Z0-9_]+)"?\s+type\s+([a-zA-Z0-9_()]+)/i);
      if (typeMatch) {
        const tableName = typeMatch[1];
        const colName = typeMatch[2];
        const targetType = typeMatch[3].toLowerCase().replace(/\(.*\)/, '');

        const colInfo = await prisma.$queryRaw(
          Prisma.sql`SELECT data_type, udt_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${colName}`
        );
        if (colInfo.length > 0) {
          const currentType = colInfo[0].udt_name.toLowerCase();
          if (currentType === targetType) {
            console.log(`      ${tableName}.${colName} ya es ${targetType}, saltando`);
            continue;
          }
        }
      }
    }

    // CREATE INDEX -> IF NOT EXISTS
    if (lower.startsWith('create index') || lower.startsWith('create unique index')) {
      const idxMatch = stmt.match(/create (?:unique )?index\s+"?([a-zA-Z0-9_]+)"?/i);
      if (idxMatch) {
        const idxName = idxMatch[1];
        const exists = await prisma.$queryRaw(
          Prisma.sql`SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = ${idxName}`
        );
        if (exists.length > 0) {
          console.log(`      indice ${idxName} ya existe, saltando`);
          continue;
        }
      }
    }

    // DROP COLUMN -> IF EXISTS
    if (lower.includes('drop column') && !lower.includes('if exists')) {
      const dropMatch = stmt.match(/alter table\s+"?([a-zA-Z0-9_]+)"?\s+drop column\s+"?([a-zA-Z0-9_]+)"?/i);
      if (dropMatch) {
        const tableName = dropMatch[1];
        const colName = dropMatch[2];
        const exists = await prisma.$queryRaw(
          Prisma.sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${colName}`
        );
        if (exists.length === 0) {
          console.log(`      columna ${tableName}.${colName} ya no existe, saltando DROP`);
          continue;
        }
      }
    }

    // ALTER TABLE ALTER COLUMN DROP NOT NULL -> verificar
    if (lower.includes('alter column') && lower.includes('drop not null')) {
      const colMatch = stmt.match(/alter table\s+"?([a-zA-Z0-9_]+)"?\s+alter column\s+"?([a-zA-Z0-9_]+)"?\s+drop not null/i);
      if (colMatch) {
        const tableName = colMatch[1];
        const colName = colMatch[2];
        const colInfo = await prisma.$queryRaw(
          Prisma.sql`SELECT is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${tableName} AND column_name = ${colName}`
        );
        if (colInfo.length > 0 && colInfo[0].is_nullable === 'YES') {
          console.log(`      ${tableName}.${colName} ya es nullable, saltando`);
          continue;
        }
      }
    }

    // Ejecutar el statement
    try {
      await prisma.$executeRawUnsafe(stmt);
    } catch (e) {
      // Ignorar errores de "ya existe" que no capturamos arriba
      if (e.message.includes('already exists') || e.message.includes('duplicate')) {
        console.log(`      objeto ya existe (error capturado): ${stmt.substring(0, 80)}...`);
        continue;
      }
      console.error(`      ERROR ejecutando: ${stmt.substring(0, 120)}...`);
      console.error(`      ${e.message}`);
      return false;
    }
  }

  console.log('   SQL ejecutado correctamente');
  return true;
}

/**
 * Verifica si una migracion ya fue realmente aplicada mirando sus objetos principales.
 * Devuelve true si la migracion parece aplicada, false si falta algo.
 */
async function isMigrationReallyApplied(prisma, migrationSql, migrationName) {
  // Extraer objetos principales
  const types = [...migrationSql.matchAll(/CREATE TYPE\s+"?([a-zA-Z0-9_]+)"?/gi)].map(m => m[1]);
  const tables = [...migrationSql.matchAll(/CREATE TABLE\s+"?([a-zA-Z0-9_]+)"?/gi)].map(m => m[1]);
  const columns = [...migrationSql.matchAll(/ALTER TABLE\s+"?([a-zA-Z0-9_]+)"?\s+ADD COLUMN\s+"?([a-zA-Z0-9_]+)"?/gi)].map(m => ({ table: m[1], column: m[2] }));

  // Verificar types
  for (const typeName of types) {
    const exists = await prisma.$queryRaw`SELECT 1 FROM pg_type WHERE typname = ${typeName}`;
    if (exists.length === 0) {
      console.log(`   falta TYPE ${typeName}`);
      return false;
    }
  }

  // Verificar tables
  for (const tableName of tables) {
    const exists = await prisma.$queryRaw(
      Prisma.sql`SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${tableName}`
    );
    if (exists.length === 0) {
      console.log(`   falta TABLE ${tableName}`);
      return false;
    }
  }

  // Verificar columns
  for (const { table, column } of columns) {
    const exists = await prisma.$queryRaw(
      Prisma.sql`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}`
    );
    if (exists.length === 0) {
      console.log(`   falta COLUMN ${table}.${column}`);
      return false;
    }
  }

  return true;
}

async function main() {
  console.log('-> verificando migraciones de Prisma');

  // 1. Obtener todas las migraciones del disco
  const migrationDirs = fs.readdirSync(MIGRATIONS_DIR)
    .filter(d => fs.statSync(path.join(MIGRATIONS_DIR, d)).isDirectory())
    .sort();

  console.log(`   ${migrationDirs.length} migraciones en disco`);

  const prisma = new PrismaClient();

  try {
    // 2. Obtener migraciones ya aplicadas segun _prisma_migrations
    const applied = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL
    `;
    const appliedSet = new Set(applied.map(m => m.migration_name));

    // 3. Obtener migraciones fallidas
    const failed = await prisma.$queryRaw`
      SELECT migration_name FROM _prisma_migrations
      WHERE started_at IS NOT NULL AND finished_at IS NULL AND rolled_back_at IS NULL
    `;
    const failedSet = new Set(failed.map(m => m.migration_name));

    console.log(`   ${appliedSet.size} aplicadas, ${failedSet.size} fallidas segun Prisma`);

    // 4. Para cada migracion, verificar si realmente se aplico
    const migrationsToFix = [];
    for (const dir of migrationDirs) {
      const migrationFile = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (!fs.existsSync(migrationFile)) continue;

      const sql = fs.readFileSync(migrationFile, 'utf-8');
      const isApplied = appliedSet.has(dir);
      const isFailed = failedSet.has(dir);

      if (isFailed) {
        console.log(`-> Migracion fallida: ${dir}`);
        migrationsToFix.push({ name: dir, sql, action: 'execute' });
        continue;
      }

      if (isApplied) {
        // Verificar si realmente se aplico
        const reallyApplied = await isMigrationReallyApplied(prisma, sql, dir);
        if (!reallyApplied) {
          console.log(`-> Migracion marcada como applied pero falta SQL: ${dir}`);
          migrationsToFix.push({ name: dir, sql, action: 'execute' });
        }
        continue;
      }

      // Migracion no aplicada ni fallida: se aplicara con migrate deploy despues
    }

    // 5. Ejecutar SQL faltante y marcar como applied
    for (const { name, sql } of migrationsToFix) {
      console.log(`-> Reparando: ${name}`);
      const ok = await executeMigrationIdempotent(prisma, sql, name);
      if (!ok) {
        console.error(`-> ERROR: no se pudo ejecutar el SQL de ${name}. Abortando.`);
        return 1;
      }

      // Marcar como applied si no lo esta ya
      if (!appliedSet.has(name)) {
        console.log(`   Marcando como aplicada...`);
        const resolve = run(`npx prisma migrate resolve --applied "${name}" --schema="${SCHEMA}"`);
        if (!resolve.success) {
          console.error('-> ERROR: migrate resolve --applied fallo.');
          return 1;
        }
      }
    }

    // 6. Aplicar migraciones restantes con migrate deploy
    console.log('-> Aplicando migraciones restantes con migrate deploy...');
    const deploy = run(`npx prisma migrate deploy --schema="${SCHEMA}"`);
    if (!deploy.success) {
      console.error('-> ERROR: migrate deploy fallo.');
      return 1;
    }

    console.log('-> Todas las migraciones estan aplicadas correctamente');
    return 0;

  } finally {
    await prisma.$disconnect();
  }
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
