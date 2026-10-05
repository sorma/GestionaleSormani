import { CategoriaMobile } from "@prisma/client";

export const categorieMobile: Record<CategoriaMobile, string> = {
  DIVANO: "Divano",
  TAVOLO: "Tavolo",
  SEDIE: "Sedie",
  CUCINA: "Cucina",
  LETTO: "Letto",
  ARMADIATURE: "Armadiature",
  COMODINO: "Comodino",
  SCRIVANIA: "Scrivania",
  MENSOLE: "Mensole",
  COMO: "Comò"
};

export function parseCategoria(value: unknown): CategoriaMobile | null {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(categorieMobile, value)
    ? value as CategoriaMobile : null;
}
