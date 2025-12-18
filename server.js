import express from "express";
import session from "express-session";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== CONFIG ======
const PORT = process.env.PORT || 3000;

// Troque aqui a senha do admin (depois podemos mover para env)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "chico@1544";

// Banco SQLite (cria arquivo automaticamente)
const dbFile = process.env.DB_PATH || path.join(__dirname, "database.sqlite");
const db = new Database(dbFile);


// Cria tabela se não existir
db.exec(`
  CREATE TABLE IF NOT EXISTS participants (
    id TEXT PRIMARY KEY COLLATE NOCASE,
    created_at INTEGER NOT NULL
  );
`);

// Preparação de queries
const qList = db.prepare("SELECT id, created_at FROM participants ORDER BY created_at DESC");
const qInsert = db.prepare("INSERT INTO participants (id, created_at) VALUES (?, ?)");
const qDelete = db.prepare("DELETE FROM participants WHERE id = ?");
const qCount = db.prepare("SELECT COUNT(*) as count FROM participants");
const qDraw = db.prepare("SELECT id, created_at FROM participants ORDER BY RANDOM() LIMIT 1");

// ====== APP ======
const app = express();

app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || "chico-recarga-secret",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true
      // Em produção com HTTPS: secure: true
    }
  })
);

// Static (frontend)
app.use(express.static(path.join(__dirname, "public")));

// ====== Helpers ======
function normalizeId(value) {
  return String(value || "").trim();
}

// Permitir letras, números, ponto e underline (3 a 32)
function isValidBigoId(value) {
  const v = normalizeId(value);
  return /^[A-Za-z0-9._]{3,32}$/.test(v);
}

function requireAuth(req, res, next) {
  if (req.session?.isAdmin) return next();
  return res.status(401).json({ error: "Não autorizado" });
}

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
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

app.get("/api/me", (req, res) => {
  res.json({ isAdmin: !!req.session?.isAdmin });
});

// ====== PARTICIPANTS ======
app.get("/api/participants", requireAuth, (req, res) => {
  const rows = qList.all();
  const total = qCount.get().count;
  res.json({ total, participants: rows });
});

app.post("/api/participants", requireAuth, (req, res) => {
  const id = normalizeId(req.body?.id);

  if (!isValidBigoId(id)) {
    return res.status(400).json({
      error: "ID inválido. Use apenas letras, números, ponto ou underline (3 a 32 caracteres)."
    });
  }

  try {
    qInsert.run(id, Date.now());
    return res.json({ ok: true });
  } catch (err) {
    // UNIQUE/PRIMARY KEY
    return res.status(409).json({ error: "Esse ID já está na lista." });
  }
});

app.delete("/api/participants/:id", requireAuth, (req, res) => {
  const id = normalizeId(req.params.id);

  const info = qDelete.run(id);
  if (info.changes === 0) return res.status(404).json({ error: "ID não encontrado." });

  res.json({ ok: true });
});

app.post("/api/draw", requireAuth, (req, res) => {
  const total = qCount.get().count;
  if (total === 0) return res.status(400).json({ error: "Sem participantes para sortear." });

  const winner = qDraw.get();
  res.json({ winner, total, drawnAt: Date.now() });
});

// ====== START ======
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Abra: http://localhost:${PORT}`);
});
