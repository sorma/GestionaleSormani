export const categorieMobile = {
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
} as const;

export type CategoriaMobile = keyof typeof categorieMobile;
