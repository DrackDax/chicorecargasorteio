import express from "express";
import session from "express-session";
import path from "path";
import { fileURLToPath } from "url";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== CONFIG ======
const PORT = process.env.PORT || 1000;

// Troque a senha via variável de ambiente no Render (recomendado)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "chico@123";

// Caminho do banco (no Render use: /var/data/database.sqlite com Disk)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.sqlite");

// ====== APP ======
const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "chico-recarga-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true }
  })
);

// Static frontend
app.use(express.static(path.join(__dirname, "public")));

// ====== Helpers ======
function normalizeId(value) {
  return String(value || "").trim();
}

// Permite letras, números, ponto e underline (3 a 32)
function isValidBigoId(value) {
  const v = normalizeId(value);
  return /^[A-Za-z0-9._]{3,32}$/.test(v);
}

function requireAuth(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Não autorizado" });
}

// ====== DB + Routes ======
async function main() {
  // Abre SQLite
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  // Ajustes úteis
  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec("PRAGMA synchronous = NORMAL;");

  // Cria tabela
  await db.exec(`
    CREATE TABLE IF NOT EXISTS participants (
      id TEXT PRIMARY KEY COLLATE NOCASE,
      created_at INTEGER NOT NULL
    );
  `);

  // ====== AUTH ======
  app.post("/api/login", (req, res) => {
    const password = String(req.body?.password || "");
    if (password === ADMIN_PASSWORD) {
      req.session.isAdmin = true;
      return res.json({ ok: true });
    }
    return res.status(401).json({ ok: false, error: "Senha incorreta" });
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => res.json({ ok: true }));
  });

  app.get("/api/me", (req, res) => {
    res.json({ isAdmin: !!req.session?.isAdmin });
  });

  // ====== PARTICIPANTS ======
  app.get("/api/participants", requireAuth, async (req, res) => {
    const participants = await db.all(
      "SELECT id, created_at FROM participants ORDER BY created_at DESC"
    );
    const row = await db.get("SELECT COUNT(*) as count FROM participants");
    res.json({ total: row.count, participants });
  });

  app.post("/api/participants", requireAuth, async (req, res) => {
    const id = normalizeId(req.body?.id);

    if (!isValidBigoId(id)) {
      return res.status(400).json({
        error: "ID inválido. Use apenas letras, números, ponto ou underline (3 a 32 caracteres)."
      });
    }

    try {
      await db.run(
        "INSERT INTO participants (id, created_at) VALUES (?, ?)",
        [id, Date.now()]
      );
      return res.json({ ok: true });
    } catch (err) {
      // Erro de chave primária (duplicado)
      return res.status(409).json({ error: "Esse ID já está na lista." });
    }
  });

  app.delete("/api/participants/:id", requireAuth, async (req, res) => {
    const id = normalizeId(req.params.id);

    const result = await db.run("DELETE FROM participants WHERE id = ?", [id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: "ID não encontrado." });
    }

    res.json({ ok: true });
  });

  app.post("/api/draw", requireAuth, async (req, res) => {
    const row = await db.get("SELECT COUNT(*) as count FROM participants");
    if (row.count === 0) {
      return res.status(400).json({ error: "Sem participantes para sortear." });
    }

    const winner = await db.get(
      "SELECT id, created_at FROM participants ORDER BY RANDOM() LIMIT 1"
    );

    res.json({ winner, total: row.count, drawnAt: Date.now() });
  });

  // ====== START ======
  app.listen(PORT, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`DB_PATH: ${DB_PATH}`);
  });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
