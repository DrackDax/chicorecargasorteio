const formAdd = document.getElementById("formAdd");
const inputId = document.getElementById("bigoId");
const diamondsEl = document.getElementById("diamonds");
const hint = document.getElementById("hint");

const listEl = document.getElementById("list");
const countEl = document.getElementById("count");

const btnDraw = document.getElementById("btnDraw");
const btnCopy = document.getElementById("btnCopy");
const btnLogout = document.getElementById("btnLogout");
const btnReset = document.getElementById("btnReset");

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

// ====== carregar resumo das chances ======
async function loadSummary() {
  const r = await fetch("/api/entries/summary");
  if (r.status === 401) {
    window.location.href = "login.html";
    return { totalEntries: 0, totals: [], diamondsPerChance: 200 };
  }
  return r.json();
}

async function render() {
  const data = await loadSummary();
  const totals = data.totals || [];
  const totalEntries = data.totalEntries || 0;
  const diamondsPerChance = data.diamondsPerChance || 200;

  countEl.textContent = String(totalEntries);
  listEl.innerHTML = "";

  if (totals.length === 0) {
    listEl.innerHTML = `<div class="muted">Nenhuma chance ainda. Adicione um BIGO ID e diamantes acima.</div>`;
    btnDraw.disabled = true;
    btnCopy.disabled = true;
    winnerIdEl.textContent = "—";
    winnerMetaEl.textContent = "Adicione chances para sortear.";
    return;
  }

  btnDraw.disabled = false;
  winnerMetaEl.textContent = `Total de chances: ${totalEntries} • Regra: ${diamondsPerChance} diamantes = 1 chance`;

  totals.forEach((p) => {
    const item = document.createElement("div");
    item.className = "item";

    const left = document.createElement("div");
    left.className = "item-left";

    const id = document.createElement("div");
    id.className = "item-id";
    id.textContent = p.id;

    const meta = document.createElement("div");
    meta.className = "item-date";
    meta.textContent = `Chances: ${p.chances}`;

    left.appendChild(id);
    left.appendChild(meta);

    const right = document.createElement("div");
    right.className = "row";
    right.style.marginTop = "0";

    // -1 chance
    const minusOne = document.createElement("button");
    minusOne.className = "btn btn-ghost";
    minusOne.type = "button";
    minusOne.textContent = "-1 chance";
    minusOne.addEventListener("click", async () => {
      const r = await fetch(`/api/entries/by-id/${encodeURIComponent(p.id)}/one`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setHint(err.error || "Falha ao remover 1 chance.", "err");
        return;
      }
      setHint("Removida 1 chance.", "ok");
      render();
    });

    // Excluir ID (todas as chances)
    const delAll = document.createElement("button");
    delAll.className = "btn btn-ghost";
    delAll.type = "button";
    delAll.textContent = "Excluir ID";
    delAll.addEventListener("click", async () => {
      const ok = confirm(`Excluir TODAS as chances do ID "${p.id}"?`);
      if (!ok) return;

      const r = await fetch(`/api/entries/by-id/${encodeURIComponent(p.id)}`, { method: "DELETE" });
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setHint(err.error || "Falha ao excluir ID.", "err");
        return;
      }

      const data = await r.json().catch(() => ({}));
      setHint(`ID removido. Chances removidas: ${data.removed ?? "—"}.`, "ok");
      render();
    });

    right.appendChild(minusOne);
    right.appendChild(delAll);

    item.appendChild(left);
    item.appendChild(right);

    listEl.appendChild(item);
  });
}

// Adicionar chances por diamantes
formAdd.addEventListener("submit", async (e) => {
  e.preventDefault();

  const id = normalizeId(inputId.value);
  const diamonds = Number(diamondsEl?.value);

  if (!isValidBigoId(id)) {
    setHint("ID inválido. Use apenas letras, números, ponto ou underline (3 a 32 caracteres).", "err");
    return;
  }

  if (!Number.isFinite(diamonds) || diamonds <= 0 || diamonds % 200 !== 0) {
    setHint("Diamantes inválidos. Use apenas múltiplos de 200 (200, 400, 600...).", "err");
    return;
  }

  const r = await fetch("/api/entries/by-diamonds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, diamonds })
  });

  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    setHint(err.error || "Falha ao adicionar chances.", "err");
    return;
  }

  const data = await r.json();

  inputId.value = "";
  if (diamondsEl) diamondsEl.value = 200;

  setHint(`Adicionado: ${data.chances} chance(s) para ${data.id} (${data.diamonds} diamantes).`, "ok");
  render();
});

// Sortear
btnDraw.addEventListener("click", async () => {
  const r = await fetch("/api/draw", { method: "POST" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    setHint(err.error || "Falha ao sortear.", "err");
    return;
  }

  const data = await r.json();

  winnerIdEl.textContent = data.winner.id;
  const infoText = `Sorteado em ${formatDate(data.drawnAt)} • Total de chances: ${data.total}`;
  winnerMetaEl.textContent = infoText;

  btnCopy.disabled = false;
  openWinnerOverlay(data.winner.id, infoText);
});

// Copiar vencedor
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

// Zerar chances
btnReset?.addEventListener("click", async () => {
  const ok = confirm("Tem certeza que deseja ZERAR todas as chances? Isso não pode ser desfeito.");
  if (!ok) return;

  const r = await fetch("/api/entries", { method: "DELETE" });
  if (!r.ok) {
    const err = await r.json().catch(() => ({}));
    setHint(err.error || "Falha ao zerar chances.", "err");
    return;
  }

  setHint("Chances zeradas com sucesso.", "ok");
  winnerIdEl.textContent = "—";
  winnerMetaEl.textContent = "Chances zeradas. Adicione novas chances para sortear.";
  btnCopy.disabled = true;

  render();
});

// Logout
btnLogout.addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  window.location.href = "login.html";
});

// Boot
(async function init() {
  await requireAuthOrRedirect();
  await render();
})();
