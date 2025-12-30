const formAdd = document.getElementById("formAdd");
const inputId = document.getElementById("bigoId");
const hint = document.getElementById("hint");

const listEl = document.getElementById("list");
const countEl = document.getElementById("count");

const btnDraw = document.getElementById("btnDraw");
const btnCopy = document.getElementById("btnCopy");
const btnLogout = document.getElementById("btnLogout");

const winnerIdEl = document.getElementById("winnerId");
const winnerMetaEl = document.getElementById("winnerMeta");

// Overlay vencedor
const winnerOverlay = document.getElementById("winnerOverlay");
const overlayBackdrop = document.getElementById("overlayBackdrop");
const btnOverlayClose = document.getElementById("btnOverlayClose");
const overlayWinner = document.getElementById("overlayWinner");
const overlayInfo = document.getElementById("overlayInfo");

function openWinnerOverlay(winnerId, infoText) {
  overlayWinner.textContent = winnerId || "—";
  overlayInfo.textContent = infoText || "";
  winnerOverlay.classList.remove("hidden");
  winnerOverlay.setAttribute("aria-hidden", "false");
}

function closeWinnerOverlay() {
  winnerOverlay.classList.add("hidden");
  winnerOverlay.setAttribute("aria-hidden", "true");
}

btnOverlayClose?.addEventListener("click", closeWinnerOverlay);
overlayBackdrop?.addEventListener("click", closeWinnerOverlay);

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !winnerOverlay.classList.contains("hidden")) {
    closeWinnerOverlay();
  }
});

function setHint(message, type) {
  hint.textContent = message;
  hint.className = "hint " + (type || "");
}

function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleString("pt-BR");
}

async function requireAuthOrRedirect() {
  const r = await fetch("/api/me");
  const data = await r.json();
  if (!data.isAdmin) window.location.href = "login.html";
}

function normalizeId(value) {
  return String(value || "").trim();
}

function isValidBigoId(value) {
  const v = normalizeId(value);
  return /^[A-Za-z0-9._]{3,32}$/.test(v);
}

async function loadParticipants() {
  const r = await fetch("/api/participants");
  if (r.status === 401) {
    window.location.href = "login.html";
    return { total: 0, participants: [] };
  }
  return r.json();
}

async function render() {
  const data = await loadParticipants();
  const participants = data.participants || [];
  countEl.textContent = String(data.total || 0);

  listEl.innerHTML = "";

  if (participants.length === 0) {
    listEl.innerHTML = `<div class="muted">Nenhum participante ainda. Adicione um BIGO ID acima.</div>`;
    btnDraw.disabled = true;
    btnCopy.disabled = true;
    winnerIdEl.textContent = "—";
    winnerMetaEl.textContent = "Adicione participantes para sortear.";
    return;
  }

  btnDraw.disabled = false;
  winnerMetaEl.textContent = `Total de participantes: ${participants.length}`;

  participants.forEach((p) => {
    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";

    const id = document.createElement("div");
    id.className = "item-id";
    id.textContent = p.id;

    const date = document.createElement("div");
    date.className = "item-date";
    date.textContent = `Adicionado em ${formatDate(p.created_at)}`;

    left.appendChild(id);
    left.appendChild(date);

    const right = document.createElement("div");
    const del = document.createElement("button");
    del.className = "btn btn-ghost";
    del.type = "button";
    del.textContent = "Remover";
    del.addEventListener("click", async () => {
      const r = await fetch(`/api/participants/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setHint(err.error || "Falha ao remover.", "err");
        return;
      }
      setHint("Participante removido.", "ok");
      render();
    });

    right.appendChild(del);

    item.appendChild(left);
    item.appendChild(right);

    listEl.appendChild(item);
  });
}

formAdd.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = inputId.value;

  if (!isValidBigoId(value)) {
    setHint("ID inválido. Use apenas letras, números, ponto ou underline (3 a 32 caracteres).", "err");
    return;
  }

  const id = normalizeId(value);

  const r = await fetch("/api/participants", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id })
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    setHint(err.error || "Falha ao adicionar.", "err");
    return;
  }

  inputId.value = "";
  setHint("Participante adicionado com sucesso.", "ok");
  render();
});

btnDraw.addEventListener("click", async () => {
  const r = await fetch("/api/draw", { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    setHint(err.error || "Falha ao sortear.", "err");
    return;
  }

  const data = await r.json();

  winnerIdEl.textContent = data.winner.id;
  const infoText = `Sorteado em ${formatDate(data.drawnAt)} • Total: ${data.total}`;
  winnerMetaEl.textContent = infoText;

  btnCopy.disabled = false;

  // MOSTRA A MENSAGEM ANIMADA NA TELA
  openWinnerOverlay(data.winner.id, infoText);
});


btnCopy.addEventListener("click", async () => {
  const text = winnerIdEl.textContent;
  if (!text || text === "—") return;

  try {
    await navigator.clipboard.writeText(text);
    setHint("Vencedor copiado para a área de transferência.", "ok");
  } catch {
    setHint("Não foi possível copiar automaticamente. Copie manualmente.", "err");
  }
});

btnLogout.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "login.html";
});

// Boot
(async function init() {
  await requireAuthOrRedirect();
  await render();
})();
