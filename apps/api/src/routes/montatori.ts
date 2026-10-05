import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Response } from "express";
import { prisma } from "../lib/prisma.js";

export const montatoriRouter = Router();

class ValidationError extends Error {}
class ConflictError extends Error {}

montatoriRouter.get("/", async (_request, response, next) => {
  try {
    const montatori = await prisma.montatore.findMany({ orderBy: [{ cognome: "asc" }, { nome: "asc" }, { id: "asc" }] });
    response.json(montatori.map(serializeMontatore));
  } catch (error) { next(error); }
});

montatoriRouter.post("/", async (request, response, next) => {
  try {
    const montatore = await prisma.montatore.create({ data: parseMontatore(request.body) });
    response.status(201).json(serializeMontatore(montatore));
  } catch (error) { handleError(error, response, next); }
});

montatoriRouter.put("/:id", async (request, response, next) => {
  try {
    const montatore = await prisma.montatore.update({ where: { id: parseId(request.params.id) }, data: parseMontatore(request.body) });
    response.json(serializeMontatore(montatore));
  } catch (error) { handleError(error, response, next); }
});

montatoriRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    if (await prisma.lavoroConsegna.count({ where: { montatoreId: id } })) {
      throw new ConflictError("Il montatore è collegato a lavori e non può essere eliminato.");
    }
    await prisma.montatore.delete({ where: { id } });
    response.status(204).send();
  } catch (error) { handleError(error, response, next); }
});

function parseId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) throw new ValidationError("ID montatore non valido.");
  return id;
}

function parseMontatore(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ValidationError("Dati montatore non validi.");
  const body = value as Record<string, unknown>;
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  const cognome = typeof body.cognome === "string" ? body.cognome.trim() : "";
  const telefono = typeof body.telefono === "string" ? body.telefono.trim() : "";
  if (!nome || !cognome || !telefono) throw new ValidationError("Nome, cognome e telefono sono obbligatori.");
  const costText = String(body.costoGiornaliero);
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(costText)) throw new ValidationError("Costo giornaliero non valido (massimo due decimali).");
  return { nome, cognome, telefono, costoGiornaliero: new Prisma.Decimal(costText) };
}

function serializeMontatore(montatore: { costoGiornaliero: Prisma.Decimal; [key: string]: unknown }) {
  return { ...montatore, costoGiornaliero: montatore.costoGiornaliero.toFixed(2) };
}

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ValidationError) { response.status(400).json({ message: error.message }); return; }
  if (error instanceof ConflictError) { response.status(409).json({ message: error.message }); return; }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    response.status(404).json({ message: "Montatore non trovato." }); return;
  }
  next(error);
}
