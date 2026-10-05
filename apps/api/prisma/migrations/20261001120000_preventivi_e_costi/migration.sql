CREATE TYPE "StatoPreventivo" AS ENUM ('BOZZA', 'INVIATO', 'APPROVATO', 'RIFIUTATO', 'CONVERTITO');

CREATE TABLE "preventivi" (
    "id" SERIAL NOT NULL,
    "clienteId" INTEGER NOT NULL,
    "data" DATE NOT NULL,
    "stato" "StatoPreventivo" NOT NULL DEFAULT 'BOZZA',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "preventivi_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "voci_preventivo" (
    "id" SERIAL NOT NULL,
    "preventivoId" INTEGER NOT NULL,
    "posizione" INTEGER NOT NULL,
    "descrizione" TEXT NOT NULL,
    "quantita" INTEGER NOT NULL,
    CONSTRAINT "voci_preventivo_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "opzioni_preventivo" (
    "id" SERIAL NOT NULL,
    "voceId" INTEGER NOT NULL,
    "fornitoreId" INTEGER NOT NULL,
    "prezzoVendita" DECIMAL(12,2) NOT NULL,
    "scelta" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "opzioni_preventivo_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "ordini" ADD COLUMN "preventivoId" INTEGER;
ALTER TABLE "righe_ordine" ADD COLUMN "costoAcquistoUnitario" DECIMAL(12,2);

CREATE INDEX "preventivi_clienteId_idx" ON "preventivi"("clienteId");
CREATE INDEX "voci_preventivo_preventivoId_idx" ON "voci_preventivo"("preventivoId");
CREATE INDEX "opzioni_preventivo_voceId_idx" ON "opzioni_preventivo"("voceId");
CREATE INDEX "opzioni_preventivo_fornitoreId_idx" ON "opzioni_preventivo"("fornitoreId");
CREATE UNIQUE INDEX "ordini_preventivoId_key" ON "ordini"("preventivoId");

ALTER TABLE "preventivi" ADD CONSTRAINT "preventivi_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "clienti"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "voci_preventivo" ADD CONSTRAINT "voci_preventivo_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opzioni_preventivo" ADD CONSTRAINT "opzioni_preventivo_voceId_fkey" FOREIGN KEY ("voceId") REFERENCES "voci_preventivo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "opzioni_preventivo" ADD CONSTRAINT "opzioni_preventivo_fornitoreId_fkey" FOREIGN KEY ("fornitoreId") REFERENCES "fornitori"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ordini" ADD CONSTRAINT "ordini_preventivoId_fkey" FOREIGN KEY ("preventivoId") REFERENCES "preventivi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
