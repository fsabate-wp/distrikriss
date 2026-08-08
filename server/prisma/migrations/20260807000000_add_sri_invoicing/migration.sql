-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "billingData" JSONB,
ADD COLUMN     "billingType" TEXT NOT NULL DEFAULT 'CONSUMO_FINAL';

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "ruc" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "businessName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tradeName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sriEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sriEnvironment" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "sriEstablishment" TEXT NOT NULL DEFAULT '003',
ADD COLUMN     "sriEmissionPoint" TEXT NOT NULL DEFAULT '001',
ADD COLUMN     "sriCertificateFile" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sriCertificatePassword" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sriObligadoContabilidad" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "sriSpecialContributor" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sriAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sriAccountingResolution" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "sriIvaRate" DECIMAL(4,2) NOT NULL DEFAULT 15;

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "establishment" TEXT NOT NULL,
    "emissionPoint" TEXT NOT NULL,
    "sequential" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "accessKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "xml" TEXT,
    "authorizationNumber" TEXT,
    "authorizationDate" TIMESTAMP(3),
    "responseCode" TEXT,
    "responseMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_orderId_key" ON "Invoice"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_number_key" ON "Invoice"("number");

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
