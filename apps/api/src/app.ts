import cors from "cors";
import express from "express";
import { clientiRouter } from "./routes/clienti.js";
import { ordiniRouter } from "./routes/ordini.js";
import { fornitoriRouter } from "./routes/fornitori.js";
import { preventiviRouter } from "./routes/preventivi.js";
import { montatoriRouter } from "./routes/montatori.js";
import { lavoriRouter } from "./routes/lavori.js";
import { analisiVenditeRouter } from "./routes/analisiVendite.js";

export const app = express();

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({ status: "ok", service: "gestionale-sormani-api" });
});

app.use("/api/clienti", clientiRouter);
app.use("/api/ordini", ordiniRouter);
app.use("/api/fornitori", fornitoriRouter);
app.use("/api/preventivi", preventiviRouter);
app.use("/api/montatori", montatoriRouter);
app.use("/api/lavori", lavoriRouter);
app.use("/api/analisi-vendite", analisiVenditeRouter);

app.use((error: unknown, _request: express.Request, response: express.Response, _next: express.NextFunction) => {
  console.error(error);
  response.status(500).json({ message: "Errore interno del server." });
});

