-- Add bulk/weight support to Product
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;
ALTER TABLE "Product" ADD COLUMN "presentation" TEXT;
ALTER TABLE "Product" ADD COLUMN "minQuantity" DECIMAL(10,2) NOT NULL DEFAULT 1;
ALTER TABLE "Product" ADD COLUMN "stepQuantity" DECIMAL(10,2) NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- Extend OrderItem for weight support
ALTER TABLE "OrderItem" ADD COLUMN "sku" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "presentation" TEXT;
ALTER TABLE "OrderItem" ALTER COLUMN "quantity" TYPE DECIMAL(10,2) USING "quantity"::DECIMAL(10,2);
