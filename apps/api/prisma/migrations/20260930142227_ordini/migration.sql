-- CreateEnum
CREATE TYPE "StatoOrdine" AS ENUM ('BOZZA', 'CONFERMATO');

-- CreateTable
CREATE TABLE "ordini" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "dataOrdine" DATE NOT NULL,
    "stato" "StatoOrdine" NOT NULL DEFAULT 'BOZZA',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ordini_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "righe_ordine" (
    "id" SERIAL NOT NULL,
    "ordineId" INTEGER NOT NULL,
    "posizione" INTEGER NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" INTEGER NOT NULL,
    "prezzoUnitario" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "righe_ordine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ordini_clienteId_idx" ON "ordini"("clienteId");

-- CreateIndex
CREATE INDEX "righe_ordine_ordineId_idx" ON "righe_ordine"("ordineId");

-- AddForeignKey
ALTER TABLE "ordini" ADD CONSTRAINT "ordini_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clienti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "righe_ordine" ADD CONSTRAINT "righe_ordine_ordineId_fkey" FOREIGN KEY ("ordineId") REFERENCES "ordini"("id") ON DELETE CASCADE ON UPDATE CASCADE;
