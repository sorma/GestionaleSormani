import { Prisma } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../lib/prisma.js";

export const clientiRouter = Router();

clientiRouter.get("/", async (_request, response, next) => {
  try {
    const clienti = await prisma.cliente.findMany({
      orderBy: [{ cognome: "asc" }, { nome: "asc" }, { id: "asc" }]
    });
    response.json(clienti);
  } catch (error) {
    next(error);
  }
});

clientiRouter.get("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const cliente = await prisma.cliente.findUnique({ where: { id } });
    if (!cliente) {
      response.status(404).json({ message: "Cliente non trovato." });
      return;
    }
    response.json(cliente);
  } catch (error) {
    handleClienteError(error, response, next);
  }
});

clientiRouter.post("/", async (request, response, next) => {
  try {
    const input = parseCliente(request.body);
    const cliente = await prisma.cliente.create({ data: input });
    response.status(201).json(cliente);
  } catch (error) {
    handleClienteError(error, response, next);
  }
});

clientiRouter.put("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const input = parseCliente(request.body);
    const cliente = await prisma.cliente.update({ where: { id }, data: input });
    response.json(cliente);
  } catch (error) {
    handleClienteError(error, response, next);
  }
});

clientiRouter.delete("/:id", async (request, response, next) => {
  try {
    const id = parseId(request.params.id);
    const [ordiniCollegati, preventiviCollegati] = await Promise.all([
      prisma.ordine.count({ where: { clienteId: id } }),
      prisma.preventivo.count({ where: { clienteId: id } })
    ]);
    if (ordiniCollegati > 0 || preventiviCollegati > 0) {
      response.status(409).json({ message: "Il cliente ha ordini o preventivi collegati e non può essere eliminato." });
      return;
    }
    await prisma.cliente.delete({ where: { id } });
    response.status(204).send();
  } catch (error) {
    handleClienteError(error, response, next);
  }
});

class ValidationError extends Error {}

function parseId(value: string) {
  const id = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(id) || id < 1) {
    throw new ValidationError("ID cliente non valido.");
  }
  return id;
}

function handleClienteError(error: unknown, response: import("express").Response, next: import("express").NextFunction) {
  if (error instanceof ValidationError) {
    response.status(400).json({ message: error.message });
    return;
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({ message: "Email o codice fiscale già presenti." });
      return;
    }
    if (error.code === "P2025") {
      response.status(404).json({ message: "Cliente non trovato." });
      return;
    }
    if (error.code === "P2003") {
      response.status(409).json({ message: "Il cliente ha ordini collegati e non può essere eliminato." });
      return;
    }
  }
  next(error);
}

function parseCliente(value: unknown): Prisma.ClienteCreateInput {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ValidationError("Dati cliente non validi.");
  }

  const body = value as Record<string, unknown>;
  const nome = requiredText(body.nome, "Il nome è obbligatorio.");
  const cognome = requiredText(body.cognome, "Il cognome è obbligatorio.");
  const email = optionalText(body.email);

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ValidationError("Inserisci un indirizzo email valido.");
  }

  return {
    nome,
    cognome,
    email,
    telefono: optionalText(body.telefono),
    indirizzo: optionalText(body.indirizzo),
    citta: optionalText(body.citta),
    cap: optionalText(body.cap),
    provincia: optionalText(body.provincia)?.toUpperCase(),
    codiceFiscale: optionalText(body.codiceFiscale)?.toUpperCase(),
    note: optionalText(body.note)
  };
}

function requiredText(value: unknown, message: string) {
  const parsed = optionalText(value);
  if (!parsed) throw new ValidationError(message);
  return parsed;
}

function optionalText(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new ValidationError("Uno o più campi non sono validi.");
  const parsed = value.trim();
  return parsed || null;
}
