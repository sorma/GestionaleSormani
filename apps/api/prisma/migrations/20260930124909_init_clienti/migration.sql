-- CreateTable
CREATE TABLE "clienti" (
    "id" SERIAL NOT NULL,
    "ragioneSociale" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "indirizzo" TEXT,
    "citta" TEXT,
    "cap" TEXT,
    "provincia" TEXT,
    "partitaIva" TEXT,
    "codiceFiscale" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clienti_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "clienti_email_key" ON "clienti"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clienti_partitaIva_key" ON "clienti"("partitaIva");

-- CreateIndex
CREATE UNIQUE INDEX "clienti_codiceFiscale_key" ON "clienti"("codiceFiscale");
