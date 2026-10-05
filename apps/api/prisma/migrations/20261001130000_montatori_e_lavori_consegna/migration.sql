CREATE TYPE "TipoIncaricato" AS ENUM ('TITOLARE', 'MONTATORE');
CREATE TYPE "StatoLavoro" AS ENUM ('PIANIFICATO', 'COMPLETATO');

CREATE TABLE "montatori" (
    "id" SERIAL NOT NULL,
    "nome" TEXT NOT NULL,
    "cognome" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "costoGiornaliero" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "montatori_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lavori_consegna" (
    "id" SERIAL NOT NULL,
    "ordineId" INTEGER NOT NULL,
    "tipoIncaricato" "TipoIncaricato" NOT NULL,
    "montatoreId" INTEGER,
    "costoGiornalieroApplicato" DECIMAL(12,2) NOT NULL,
    "dataInizio" DATE NOT NULL,
    "giorni" INTEGER NOT NULL,
    "stato" "StatoLavoro" NOT NULL DEFAULT 'PIANIFICATO',
    "dataCompletamento" DATE,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "lavori_consegna_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lavori_consegna_ordineId_key" ON "lavori_consegna"("ordineId");
CREATE INDEX "lavori_consegna_montatoreId_idx" ON "lavori_consegna"("montatoreId");

ALTER TABLE "lavori_consegna" ADD CONSTRAINT "lavori_consegna_ordineId_fkey" FOREIGN KEY ("ordineId") REFERENCES "ordini"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lavori_consegna" ADD CONSTRAINT "lavori_consegna_montatoreId_fkey" FOREIGN KEY ("montatoreId") REFERENCES "montatori"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
