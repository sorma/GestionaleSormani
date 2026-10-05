import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Response } from "express";
import { prisma } from "../lib/prisma.js";

export const fornitoriRouter = Router();

fornitoriRouter.get("/", async (_request, response, next) => {
  try {
    response.json(await prisma.fornitore.findMany({ orderBy: [{ nome: "asc" }, { id: "asc" }] }));
  } catch (error) {
    next(error);
  }
});

fornitoriRouter.post("/", async (request, response, next) => {
  try {
    const fornitore = await prisma.fornitore.create({ data: parseFornitore(request.body) });
    response.status(201).json(fornitore);
  } catch (error) {
    handleError(error, response, next);
  }
});

fornitoriRouter.put("/:id", async (request, response, next) => {
  try {
    const fornitore = await prisma.fornitore.update({
      where: { id: parseId(request.params.id) },
      data: parseFornitore(request.body)
    });
    response.json(fornitore);
  } catch (error) {
    handleError(error, response, next);
  }
});

fornitoriRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const [righe, opzioni] = await Promise.all([
      prisma.rigaOrdine.count({ where: { fornitoreId: id } }),
      prisma.opzionePreventivo.count({ where: { fornitoreId: id } })
    ]);
    if (righe || opzioni) {
      response.status(409).json({ message: "Il fornitore è collegato a ordini o preventivi e non può essere eliminato." });
      return;
    }
    await prisma.fornitore.delete({ where: { id } });
    response.status(204).send();
  } catch (error) {
    handleError(error, response, next);
  }
});

class ValidationError extends Error {}

function parseId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
    throw new ValidationError("ID fornitore non valido.");
  }
  return id;
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("Dati fornitore non validi.");
  return value.trim() || null;
}

function parseFornitore(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Dati fornitore non validi.");
  }
  const body = value as Record<string, unknown>;
  const nome = optionalText(body.nome);
  if (!nome) throw new ValidationError("Il nome del fornitore è obbligatorio.");
  const email = optionalText(body.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Inserisci un indirizzo email valido.");
  }
  return { nome, email, telefono: optionalText(body.telefono), note: optionalText(body.note) };
}

function handleError(error: unknown, response: Response, next: NextFunction) {
  if (error instanceof ValidationError) {
    response.status(400).json({ message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({ message: "Esiste già un fornitore con questo nome." });
      return;
    }
    if (error.code === "P2025") {
      response.status(404).json({ message: "Fornitore non trovato." });
      return;
    }
  }
  next(error);
}
