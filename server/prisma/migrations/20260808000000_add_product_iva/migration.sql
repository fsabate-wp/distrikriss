-- AlterTable
ALTER TABLE "Product" ADD COLUMN "ivaRate" INTEGER;

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN "ivaRate" DECIMAL(4,2);
