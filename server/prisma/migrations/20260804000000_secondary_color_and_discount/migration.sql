-- AlterTable
ALTER TABLE "Settings" ADD COLUMN "secondaryColor" TEXT NOT NULL DEFAULT '#1B5E20';

-- AlterTable
ALTER TABLE "Product" ADD COLUMN "discount" INTEGER NOT NULL DEFAULT 0;