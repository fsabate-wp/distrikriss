-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#4CAF50',
    "polygon" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "deliveryDays" JSONB NOT NULL,
    "slots" JSONB NOT NULL,
    "deliveryFeeBase" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "deliveryFeePerKm" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "minOrderAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);