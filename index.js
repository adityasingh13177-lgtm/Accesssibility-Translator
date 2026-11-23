// Local dev server: serves the website AND the API on one port (default 4000).
// MongoDB is optional: without MONGO_URI documents are processed but not stored on the server.
import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { cfg } from "./config.js";
import { warmUp } from "./services/providers.js";
import { documentsRouter, resultsRouter } from "./routes/documents.js";

const here = path.dirname(fileURLToPath(import.meta.url));
// STUB auth for local use. In your real app, pass your own login middleware here.
const auth = { optional: (req, _res, next) => next(), required: (_req, res) => res.status(401).json({ message: "Please sign in.", code: "AUTH" }) };

let Doc = null;
if (process.env.MONGO_URI) {
  const mongoose = (await import("mongoose")).default;
  Doc = (await import("./models/Document.js")).default;
  await mongoose.connect(process.env.MONGO_URI);
  console.log("MongoDB connected");
} else console.log("No MONGO_URI: running without a database (fine for trying it out).");
console.log(`AI engine: ${cfg.provider}${cfg.provider === "ollama" ? " (" + cfg.ollama.model + ")" : ""}`);
if (cfg.provider === "anthropic" && !process.env.ANTHROPIC_API_KEY) console.warn("WARNING: ANTHROPIC_API_KEY is missing. Add it to server/.env or results will fail.");

const app = express();
app.use("/api/documents", documentsRouter({ auth, Doc }));
app.use("/api/results", resultsRouter({ auth, Doc }));
app.use(express.static(path.join(here, "../../frontend")));
const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Open http://localhost:${port}`);
  if (cfg.provider === "ollama") warmUp().catch((e) => console.warn(e.message)); // load the model now so the first request is fast
});
