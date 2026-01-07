import express from "express";
import session from "express-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import sqlite3 from "sqlite3";
import { open } from "sqlite";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== CONFIG ======
const PORT = process.env.PORT || 10000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "chico@123";

// Banco (Render com Disk: /var/data/database.sqlite)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
// garante pasta do DB
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

// Regra
const DIAMONDS_PER_CHANCE = 200;
const MAX_CHANCES_PER_ADD = 5000; // limite de segurança

// ====== APP ======
const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "chico-recarga-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax"
      // secure: true // opcional (HTTPS)
    }
  })
);

app.use(express.static(path.join(__dirname, "public")));

// ====== Helpers ======
function normalizeId(value) {
  return String(value || "").trim();
}

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
  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec("PRAGMA journal_mode = WAL;");
  await db.exec("PRAGMA synchronous = NORMAL;");

  // Chances (permite repetir BIGO ID)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS entries (
      entry_id INTEGER PRIMARY KEY AUTOINCREMENT,
      bigo_id TEXT NOT NULL COLLATE NOCASE,
      diamonds INTEGER NOT NULL,
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

  // ====== ENTRIES (CHANCES) ======

  // Resumo: ID + chances, total de chances
  app.get("/api/entries/summary", requireAuth, async (req, res) => {
    const totals = await db.all(`
      SELECT bigo_id as id, COUNT(*) as chances
      FROM entries
      GROUP BY bigo_id
      ORDER BY chances DESC, id ASC
    `);

    const row = await db.get("SELECT COUNT(*) as totalEntries FROM entries");
    res.json({
      totalEntries: row.totalEntries,
      totals,
      diamondsPerChance: DIAMONDS_PER_CHANCE
    });
  });

  // Adiciona chances via diamantes (múltiplos de 200)
  app.post("/api/entries/by-diamonds", requireAuth, async (req, res) => {
    const bigo_id = normalizeId(req.body?.id);
    const diamondsRaw = Number(req.body?.diamonds);

    if (!isValidBigoId(bigo_id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    if (!Number.isFinite(diamondsRaw)) {
      return res.status(400).json({ error: "Diamantes inválidos." });
    }

    const diamonds = Math.floor(diamondsRaw);

    if (diamonds <= 0) {
      return res.status(400).json({ error: "Diamantes deve ser maior que zero." });
    }

    if (diamonds % DIAMONDS_PER_CHANCE !== 0) {
      return res
        .status(400)
        .json({ error: `Só vale múltiplos de ${DIAMONDS_PER_CHANCE} diamantes.` });
    }

    const chances = diamonds / DIAMONDS_PER_CHANCE;

    if (chances < 1 || chances > MAX_CHANCES_PER_ADD) {
      return res.status(400).json({
        error: `Quantidade de chances inválida (1 a ${MAX_CHANCES_PER_ADD}).`
      });
    }

    const now = Date.now();

    await db.exec("BEGIN");
    try {
      for (let i = 0; i < chances; i++) {
        await db.run(
          "INSERT INTO entries (bigo_id, diamonds, created_at) VALUES (?, ?, ?)",
          [bigo_id, diamonds, now]
        );
      }
      await db.exec("COMMIT");
    } catch (e) {
      await db.exec("ROLLBACK");
      throw e;
    }

    res.json({ ok: true, id: bigo_id, diamonds, chances });
  });

  // Zerar chances (novo sorteio)
  app.delete("/api/entries", requireAuth, async (req, res) => {
    await db.run("DELETE FROM entries");
    res.json({ ok: true });
  });

  // Excluir ID (remove todas as chances daquele ID)
  app.delete("/api/entries/by-id/:id", requireAuth, async (req, res) => {
    const id = normalizeId(req.params.id);

    if (!isValidBigoId(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const result = await db.run("DELETE FROM entries WHERE bigo_id = ?", [id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: "ID não encontrado nas chances." });
    }

    res.json({ ok: true, removed: result.changes });
  });

  // -1 chance (remove 1 entry daquele ID)
  app.delete("/api/entries/by-id/:id/one", requireAuth, async (req, res) => {
    const id = normalizeId(req.params.id);

    if (!isValidBigoId(id)) {
      return res.status(400).json({ error: "ID inválido." });
    }

    const row = await db.get(
      "SELECT entry_id FROM entries WHERE bigo_id = ? ORDER BY entry_id DESC LIMIT 1",
      [id]
    );

    if (!row) {
      return res.status(404).json({ error: "Esse ID não tem chances." });
    }

    await db.run("DELETE FROM entries WHERE entry_id = ?", [row.entry_id]);

    res.json({ ok: true, removed: 1 });
  });

  // ====== DRAW (SORTEIO POR CHANCES) ======
  app.post("/api/draw", requireAuth, async (req, res) => {
    const row = await db.get("SELECT COUNT(*) as count FROM entries");
    if (row.count === 0) {
      return res.status(400).json({ error: "Sem entradas (chances) para sortear." });
    }

    const winner = await db.get(`
      SELECT bigo_id as id
      FROM entries
      ORDER BY RANDOM()
      LIMIT 1
    `);

    res.json({
      winner,
      total: row.count,
      drawnAt: Date.now(),
      diamondsPerChance: DIAMONDS_PER_CHANCE
    });
  });

  // ====== START ======
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando na porta ${PORT}`);
    console.log(`DB_PATH: ${DB_PATH}`);
    console.log(`Regra: ${DIAMONDS_PER_CHANCE} diamantes = 1 chance`);
  });
}

main().catch((err) => {
  console.error("Falha ao iniciar o servidor:", err);
  process.exit(1);
});
