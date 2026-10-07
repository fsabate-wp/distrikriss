-- ============================================================================
-- Correlativo de codigo de pedido, bloqueo de horarios y credenciales de pago
--
-- Order.code es UNIQUE y se generaba con count() + 1: dos pedidos simultaneos
-- obtenian el mismo codigo y el segundo moria con un 500. Ademas el numero se
-- reutilizaba al cancelar un pedido.
-- ============================================================================

CREATE TABLE "OrderSequence" (
    "id" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderSequence_pkey" PRIMARY KEY ("id")
);

-- Semilla: arranca por encima del codigo mas alto ya emitido, para no repetir
-- ninguno aunque un pedido se haya borrado.
INSERT INTO "OrderSequence" ("id", "value", "updatedAt")
SELECT
    'order-code',
    COALESCE(
        (SELECT MAX(NULLIF(regexp_replace("code", '^DK-', ''), '')::int)
           FROM "Order" WHERE "code" ~ '^DK-[0-9]+$'),
        0
    ),
    NOW();

-- Credenciales de pago: se guardan cifradas en reposo con AES-256-GCM, igual que
-- la contrasena del certificado. Antes vivian en settings.bankTransfer en
-- texto plano y se servian a cualquier visitante en /api/settings/public.
ALTER TABLE "Settings" ADD COLUMN "bankTransferEnc" TEXT NOT NULL DEFAULT '';

-- ============================================================================
-- Filas de bloqueo por horario de entrega
--
-- PostgreSQL no admite FOR UPDATE con agregados, asi que no se puede bloquear
-- mientras se cuenta. Estas filas existen siempre: la primera peticion de cada
-- horario crea la suya y, a partir de ahi, todas las transacciones que compiten
-- por ese horario esperan en la misma fila. Asi solo una puede contar y reservar
-- a la vez, y las demas reciben SLOT_FULL en lugar de sobrevender.
-- ============================================================================
CREATE TABLE "SlotLock" (
    "slotKey" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlotLock_pkey" PRIMARY KEY ("slotKey")
);

-- Semilla desde los horarios ya declarados, para que el primer pedido tras
-- desplegar no tenga que crear la fila bajo contencion.
--
-- El cast a jsonb va dentro del LATERAL: la columna "slots" es de tipo Json, que
-- en PostgreSQL es jsonb, pero al aplicarle jsonb_array_elements directamente el
-- operador "->>" se resuelve contra el tipo de la tabla y no encuentra la
-- firma de jsonb.
INSERT INTO "SlotLock" ("slotKey", "updatedAt")
SELECT DISTINCT z."id" || '|' || (s.item->>'id'), NOW()
FROM "DeliveryZone" z
CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(z."slots") = 'array' THEN z."slots" ELSE '[]'::jsonb END
) AS s(item)
WHERE s.item->>'id' IS NOT NULL
ON CONFLICT DO NOTHING;

-- El indice que usa reserveSlot para contar la ocupacion de un horario.
CREATE INDEX IF NOT EXISTS "Order_deliveryDate_slotId_status_idx"
    ON "Order"("deliveryDate", "slotId")
    WHERE "status" <> 'CANCELLED';