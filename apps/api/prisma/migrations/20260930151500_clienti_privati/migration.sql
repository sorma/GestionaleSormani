-- Introduce nome e cognome senza perdere eventuali clienti già inseriti.
ALTER TABLE "clienti" ADD COLUMN "nome" TEXT;
ALTER TABLE "clienti" ADD COLUMN "cognome" TEXT;

UPDATE "clienti"
SET "nome" = '', "cognome" = "ragioneSociale";

ALTER TABLE "clienti" ALTER COLUMN "nome" SET NOT NULL;
ALTER TABLE "clienti" ALTER COLUMN "cognome" SET NOT NULL;

DROP INDEX IF EXISTS "clienti_partitaIva_key";
ALTER TABLE "clienti" DROP COLUMN "ragioneSociale";
ALTER TABLE "clienti" DROP COLUMN "partitaIva";
