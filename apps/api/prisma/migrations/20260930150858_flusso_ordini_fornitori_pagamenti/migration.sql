-- CreateEnum
CREATE TYPE "TipoPagamento" AS ENUM ('ACCONTO', 'SALDO');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StatoOrdine" ADD VALUE 'IN_ATTESA_FORNITORI';
ALTER TYPE "StatoOrdine" ADD VALUE 'PRONTO_CONSEGNA';
ALTER TYPE "StatoOrdine" ADD VALUE 'CONSEGNATO';

-- AlterTable
ALTER TABLE "ordini" ADD COLUMN     "dataConsegnaEffettiva" DATE,
ADD COLUMN     "dataConsegnaPrevista" DATE;

-- AlterTable
ALTER TABLE "righe_ordine" ADD COLUMN     "arrivoEffettivo" DATE,
ADD COLUMN     "arrivoPrevisto" DATE,
ADD COLUMN     "dataConfermaFornitore" DATE,
ADD COLUMN     "dataOrdineFornitore" DATE,
ADD COLUMN     "fornitoreId" INTEGER;

-- CreateTable
CREATE TABLE "fornitori" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fornitori_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamenti_ordine" (
    "id" SERIAL NOT NULL,
    "ordineId" INTEGER NOT NULL,
    "tipo" "TipoPagamento" NOT NULL,
    "importo" DECIMAL(12,2) NOT NULL,
    "dataPagamento" DATE NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamenti_ordine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fornitori_nome_key" ON "fornitori"("nome");

-- CreateIndex
CREATE INDEX "pagamenti_ordine_ordineId_idx" ON "pagamenti_ordine"("ordineId");

-- CreateIndex
CREATE INDEX "righe_ordine_fornitoreId_idx" ON "righe_ordine"("fornitoreId");

-- AddForeignKey
ALTER TABLE "righe_ordine" ADD CONSTRAINT "righe_ordine_fornitoreId_fkey" FOREIGN KEY ("fornitoreId") REFERENCES "fornitori"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamenti_ordine" ADD CONSTRAINT "pagamenti_ordine_ordineId_fkey" FOREIGN KEY ("ordineId") REFERENCES "ordini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
