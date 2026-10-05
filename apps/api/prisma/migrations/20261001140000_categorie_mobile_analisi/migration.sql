CREATE TYPE "CategoriaMobile" AS ENUM ('DIVANO', 'TAVOLO', 'SEDIE', 'CUCINA', 'LETTO', 'ARMADIATURE', 'COMODINO', 'SCRIVANIA', 'MENSOLE', 'COMO');

ALTER TABLE "righe_ordine" ADD COLUMN "categoria" "CategoriaMobile";
ALTER TABLE "voci_preventivo" ADD COLUMN "categoria" "CategoriaMobile";

-- Classifica soltanto descrizioni storiche riconoscibili; conserva sempre il testo originale.
UPDATE "righe_ordine" SET "categoria" = CASE
  WHEN lower(trim("descrizione")) LIKE 'divan%' THEN 'DIVANO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'tavol%' THEN 'TAVOLO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'sedi%' THEN 'SEDIE'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'cucin%' THEN 'CUCINA'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'lett%' THEN 'LETTO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'armadiatur%' THEN 'ARMADIATURE'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'comodin%' THEN 'COMODINO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'scrivani%' THEN 'SCRIVANIA'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'mensol%' THEN 'MENSOLE'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'comò%' OR lower(trim("descrizione")) LIKE 'como%' THEN 'COMO'::"CategoriaMobile"
  ELSE NULL END;

UPDATE "voci_preventivo" SET "categoria" = CASE
  WHEN lower(trim("descrizione")) LIKE 'divan%' THEN 'DIVANO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'tavol%' THEN 'TAVOLO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'sedi%' THEN 'SEDIE'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'cucin%' THEN 'CUCINA'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'lett%' THEN 'LETTO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'armadiatur%' THEN 'ARMADIATURE'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'comodin%' THEN 'COMODINO'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'scrivani%' THEN 'SCRIVANIA'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'mensol%' THEN 'MENSOLE'::"CategoriaMobile"
  WHEN lower(trim("descrizione")) LIKE 'comò%' OR lower(trim("descrizione")) LIKE 'como%' THEN 'COMO'::"CategoriaMobile"
  ELSE NULL END;
