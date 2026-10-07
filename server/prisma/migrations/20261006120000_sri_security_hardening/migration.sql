-- ============================================================================
-- Endurecimiento de la facturacion electronica (SRI)
--
-- 1. Secuencial atomico por serie (DocumentSeries) e idempotencia de claves.
-- 2. Bitacora de comprobantes (InvoiceEvent) y de acciones sensibles (AuditLog).
-- 3. Estado de comprobante tipado (enum) en lugar de texto libre.
-- 4. Persistencia de la respuesta del SRI y de la prueba de autorizacion
--    (authorizationProof), que es el CLAVEACCESO que exige la RIDE.
-- 5. Contrasena del certificado .p12 cifrada en reposo con AES-256-GCM.
-- 6. Snapshot del descuento en la linea del pedido, para que la factura
--    electronica refleje lo efectivamente cobrado.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Enums. Se crean primero porque DocumentSeries los referencia al crearse.
-- --------------------------------------------------------------------------
CREATE TYPE "SriDocType" AS ENUM ('FACTURA', 'NOTA_CREDITO', 'NOTA_DEBITO');

CREATE TYPE "InvoiceStatus" AS ENUM (
    'DRAFT',
    'SIGNED',
    'RECEIVED',
    'AUTHORIZED',
    'NOT_AUTHORIZED',
    'REJECTED',
    'NO_CERTIFICATE',
    'FAILED',
    'CREDITED'
);

-- El tipo de documento se agrega antes de sembrar DocumentSeries, porque la
-- semilla de cada serie se calcula sobre Invoice filtrando por docType.
ALTER TABLE "Invoice" ADD COLUMN "docType" "SriDocType" NOT NULL DEFAULT 'FACTURA';

-- --------------------------------------------------------------------------
-- 1. Serie de numeracion con correlativo atomico
-- --------------------------------------------------------------------------
CREATE TABLE "DocumentSeries" (
    "id" TEXT NOT NULL,
    "docType" "SriDocType" NOT NULL,
    "establishment" TEXT NOT NULL,
    "emissionPoint" TEXT NOT NULL,
    "sequential" INTEGER NOT NULL DEFAULT 0,
    "lastAccessKey" TEXT,
    "lastIssuedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentSeries_pkey" PRIMARY KEY ("id")
);

-- El UNIQUE es lo que permite que el INSERT ... ON CONFLICT del correlativo
-- sea una operacion atomica y no un read-then-write.
CREATE UNIQUE INDEX "DocumentSeries_docType_establishment_emissionPoint_key"
    ON "DocumentSeries"("docType", "establishment", "emissionPoint");

-- Semilla: cada serie arranca en el maximo ya emitido de ESE tipo de documento,
-- para no reutilizar un secuencial que el SRI ya vio.
INSERT INTO "DocumentSeries" ("id", "docType", "establishment", "emissionPoint", "sequential", "updatedAt")
SELECT
    'seed-' || "docType"::text || '-' || "establishment" || '-' || "emissionPoint",
    "docType",
    "establishment",
    "emissionPoint",
    COALESCE(MAX("sequential"), 0),
    NOW()
FROM "Invoice"
GROUP BY "docType", "establishment", "emissionPoint";

-- Las series de notas de credito/debito que aun no existen se crean en cero.
INSERT INTO "DocumentSeries" ("id", "docType", "establishment", "emissionPoint", "sequential", "updatedAt")
SELECT
    'seed-' || t."docType"::text || '-' || e."establishment" || '-' || e."emissionPoint",
    t."docType",
    e."establishment",
    e."emissionPoint",
    0,
    NOW()
FROM (VALUES ('NOTA_CREDITO'::"SriDocType"), ('NOTA_DEBITO'::"SriDocType")) AS t("docType")
CROSS JOIN (
    SELECT DISTINCT "establishment", "emissionPoint" FROM "Invoice"
) AS e
WHERE NOT EXISTS (
    SELECT 1 FROM "DocumentSeries" d
    WHERE d."docType" = t."docType"
      AND d."establishment" = e."establishment"
      AND d."emissionPoint" = e."emissionPoint"
);

-- --------------------------------------------------------------------------
-- 2. Ajustes del certificado: cifrado en reposo
-- --------------------------------------------------------------------------
ALTER TABLE "Settings" ADD COLUMN "sriCertificatePasswordEnc" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "sriCertificatePasswordFor" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Settings" ADD COLUMN "sriDeliveryTaxable" BOOLEAN NOT NULL DEFAULT true;

-- La columna en claro se elimina. La migracion del valor existente a la cifrada
-- la hace el despliegue leyendo SRI_CERT_SECRET; si no se migra, el panel pide
-- la contrasena de nuevo (nunca se pierde una venta por esto).
-- IF EXISTS para que la migracion sea idempotente: si se reintenta tras un
-- fallo parcial, no vuelve a fallar por la columna ya eliminada.
ALTER TABLE "Settings" DROP COLUMN IF EXISTS "sriCertificatePassword";

-- --------------------------------------------------------------------------
-- 3. Snapshot del descuento y codigo arancelario en la linea del pedido
-- --------------------------------------------------------------------------
ALTER TABLE "OrderItem" ADD COLUMN "discountPct" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OrderItem" ADD COLUMN "listPrice" DECIMAL(10,2);
ALTER TABLE "OrderItem" ADD COLUMN "sriCode" TEXT;

ALTER TABLE "Product" ADD COLUMN "sriCode" TEXT;

-- --------------------------------------------------------------------------
-- 4. Invoice: ambiente, fecha de emision, respuestas del SRI, reconciliacion
-- --------------------------------------------------------------------------
ALTER TABLE "Invoice" ADD COLUMN "environment" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "Invoice" ADD COLUMN "issueDate" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "receptionResponse" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "authorizationXml" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "authorizationProof" TEXT;
ALTER TABLE "Invoice" ADD COLUMN "totalFiscal" DECIMAL(12,2);
ALTER TABLE "Invoice" ADD COLUMN "reconciledAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "signedAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "sentAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "nextRetryAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "lastAttemptAt" TIMESTAMP(3);
ALTER TABLE "Invoice" ADD COLUMN "creditedById" TEXT;

-- Backfill del ambiente: digito 24 de la clave de acceso de 49 digitos.
-- dd(1-2) mm(3-4) yyyy(5-8) codDoc(9-10) ruc(11-23) ambiente(24)
UPDATE "Invoice"
SET "environment" = CASE
        WHEN SUBSTRING("accessKey" FROM 24 FOR 1) = '1' THEN 1
        ELSE 2
    END;

-- Backfill de la fecha de emision desde los primeros 8 digitos ddmmyyyy.
UPDATE "Invoice"
SET "issueDate" = TO_TIMESTAMP(
        SUBSTRING("accessKey" FROM 1 FOR 2) || ' ' ||
        SUBSTRING("accessKey" FROM 3 FOR 2) || ' ' ||
        SUBSTRING("accessKey" FROM 5 FOR 4),
        'DD MM YYYY'
    )
WHERE "accessKey" ~ '^[0-9]{8}' AND "issueDate" IS NULL;

-- Backfill del total fiscal desde el pedido (unico origen de verdad disponible).
UPDATE "Invoice" AS i
SET "totalFiscal" = o."total", "reconciledAt" = NOW()
FROM "Order" AS o
WHERE o."id" = i."orderId" AND i."totalFiscal" IS NULL;

-- Convertir los estados historicos (texto libre) a los valores del enum.
-- 'PENDING' era el default nunca usado: equivale a DRAFT.
UPDATE "Invoice" SET "status" = 'DRAFT' WHERE "status" NOT IN (
    'DRAFT','SIGNED','RECEIVED','AUTHORIZED','NOT_AUTHORIZED',
    'REJECTED','NO_CERTIFICATE','FAILED','CREDITED'
);

-- El default de la columna es texto ('PENDING') y Postgres no lo castea solo.
ALTER TABLE "Invoice" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "Invoice"
    ALTER COLUMN "status" TYPE "InvoiceStatus" USING "status"::"InvoiceStatus";
ALTER TABLE "Invoice"
    ALTER COLUMN "status" SET DEFAULT 'DRAFT';

ALTER TABLE "Invoice" ALTER COLUMN "issueDate" SET NOT NULL;
ALTER TABLE "Invoice" ALTER COLUMN "totalFiscal" SET NOT NULL;

-- --------------------------------------------------------------------------
-- 5. Unicidad de la clave de acceso y de la serie
-- --------------------------------------------------------------------------
-- Sin esto, dos emisiones concurrentes con el mismo secuencial persistirian
-- dos filas con la misma clave de acceso y el SRI rechazaria la segunda.
-- Dos comprobantes nunca pueden compartir clave de acceso: es el identificador
-- que el SRI usa paraRejectar duplicados.
CREATE UNIQUE INDEX "Invoice_accessKey_key" ON "Invoice"("accessKey");

-- La correlatividad tambien se protege en la base: sin este indice, dos_series
-- concurrentes con el mismo (tipo, establecimiento, punto, secuencial) —por
-- ejemplo una factura y su nota de credito mal numeradas— persistirian dos filas.
CREATE UNIQUE INDEX "Invoice_docType_establishment_emissionPoint_sequential_key"
    ON "Invoice"("docType", "establishment", "emissionPoint", "sequential");

-- Una factura solo puede ser anulada una vez.
CREATE UNIQUE INDEX "Invoice_creditedById_key" ON "Invoice"("creditedById");

ALTER TABLE "Invoice"
    ADD CONSTRAINT "Invoice_creditedById_fkey"
    FOREIGN KEY ("creditedById") REFERENCES "Invoice"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Invoice_status_nextRetryAt_idx" ON "Invoice"("status", "nextRetryAt");
CREATE INDEX "Invoice_accessKey_idx" ON "Invoice"("accessKey");

-- --------------------------------------------------------------------------
-- 6. Bitacora de comprobantes
-- --------------------------------------------------------------------------
CREATE TABLE "InvoiceEvent" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "status" "InvoiceStatus",
    "actorId" TEXT,
    "actorRole" TEXT,
    "detail" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvoiceEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvoiceEvent_invoiceId_createdAt_idx" ON "InvoiceEvent"("invoiceId", "createdAt");

ALTER TABLE "InvoiceEvent"
    ADD CONSTRAINT "InvoiceEvent_invoiceId_fkey"
    FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- --------------------------------------------------------------------------
-- 7. Auditoria de acciones sensibles
-- --------------------------------------------------------------------------
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorRole" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "target" TEXT,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");