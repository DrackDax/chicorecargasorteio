const form = document.getElementById("loginForm");
const msg = document.getElementById("msg");

async function checkAlreadyLogged() {
  const r = await fetch("/api/me");
  const data = await r.json();
  if (data.isAdmin) window.location.href = "index.html";
}

checkAlreadyLogged();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  msg.textContent = "";
  msg.className = "hint";

  const password = document.getElementById("password").value;

  const r = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });

  if (r.ok) {
    window.location.href = "index.html";
    return;
  }

  const data = await r.json().catch(() => ({}));
  msg.textContent = data.error || "Falha no login.";
  msg.className = "hint err";
});
