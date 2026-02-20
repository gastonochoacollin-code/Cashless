// wwwroot/admin.js (FINAL)

function $(id){ return document.getElementById(id); }

const jsDot = $("jsDot");
const sessionInfoEl = $("sessionInfo");
const statusEl = $("status");

const uidEl = $("uid");
const clientNameEl = $("clientName");
const clientBalanceEl = $("clientBalance");

const btnUid = $("btnUid");
const btnLogout = $("btnLogout");
const btnTopup = $("btnTopup");
const btnAssign = $("btnAssign");

const amountEl = $("amount");
const userNameEl = $("userName");

let session = null;
let currentUid = null;

function setStatus(msg, kind="idle"){
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`;
}
function setUid(uid){
  currentUid = uid || null;
  uidEl.textContent = currentUid || "—";
  uidEl.classList.toggle("muted", !currentUid);
}
function setClient(name, balance){
  clientNameEl.textContent = name ?? "—";
  clientBalanceEl.textContent = (balance ?? "—");
}

function getSession(){
  const raw = localStorage.getItem("cashless.session");
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function logout(){
  localStorage.removeItem("cashless.session");
  window.location.href = "/login.html";
}

async function api(path, opts = {}){
  if(!session?.operatorId || !session?.token){
    throw new Error("Sin sesión. Volvé a login.");
  }
  const headers = {
    "Content-Type": "application/json",
    "X-Operator-Id": String(session.operatorId),
    "X-Operator-Token": String(session.token),
    ...(opts.headers || {})
  };

  const res = await fetch(path, { ...opts, headers });
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; }
  catch { data = { message: text }; }

  if(!res.ok){
    const msg = data?.message || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function refreshBalance(){
  if(!currentUid) return;

  try{
    const b = await api(`/balance/${encodeURIComponent(currentUid)}`, { method:"GET" });
    setClient(b.userName, b.balance);
    setStatus(`✅ ${b.userName} · Saldo $${b.balance}`, "ok");
  } catch(e){
    // Normal si aún no está asignada
    setClient("—", "—");
    setStatus(`UID leído (${currentUid}) pero sin usuario/saldo: ${e.message}`, "bad");
  }
}

async function readUid(){
  setStatus("Leyendo pulsera… (click y luego acercá la pulsera)", "idle");
  setClient("—", "—");
  try{
    const data = await api("/last-uid", { method:"GET" });
    setUid(data.uid);
    await refreshBalance();
  } catch(e){
    setUid(null);
    setClient("—", "—");
    setStatus(e.message || "No hay pulsera. Volvé a intentar.", "bad");
  }
}

async function topup(){
  if(!currentUid) return setStatus("Primero leé la pulsera.", "bad");

  const amount = Number(amountEl.value);
  if(!Number.isFinite(amount) || amount <= 0){
    return setStatus("Monto inválido.", "bad");
  }

  setStatus(`Recargando $${amount}…`, "idle");
  try{
    const res = await api("/topup", {
      method:"POST",
      body: JSON.stringify({ uid: currentUid, amount })
    });

    // refrescar saldo real
    await refreshBalance();
    setStatus(`✅ Recarga OK · Nuevo saldo $${res.newBalance}`, "ok");
  } catch(e){
    setStatus(e.message || "Error recargando", "bad");
  }
}

async function createAndAssign(){
  if(!currentUid) return setStatus("Primero leé la pulsera.", "bad");

  const name = (userNameEl.value || "").trim();
  if(!name) return setStatus("Escribí el nombre del cliente.", "bad");

  setStatus("Creando usuario…", "idle");
  try{
    const user = await api("/users", {
      method:"POST",
      body: JSON.stringify({ name })
    });

    setStatus("Asignando pulsera…", "idle");
    await api("/assign-card", {
      method:"POST",
      body: JSON.stringify({ userId: user.id, uid: currentUid })
    });

    // ya asignado: refrescar balance
    await refreshBalance();
    setStatus(`✅ Asignado a ${name} (UserId ${user.id})`, "ok");
  } catch(e){
    setStatus(e.message || "Error creando/asignando", "bad");
  }
}

function init(){
  // indicador de vida
  if(jsDot) jsDot.classList.add("on");

  session = getSession();
  if(!session?.operatorId || !session?.token){
    setStatus("Sin sesión. Redirigiendo a login…", "bad");
    setTimeout(()=> window.location.href="/login.html", 600);
    return;
  }

  sessionInfoEl.textContent = `${session.name} · ${session.role} · ${session.area ?? "-"}`;

  // eventos
  btnUid.addEventListener("click", readUid);
  btnTopup.addEventListener("click", topup);
  btnAssign.addEventListener("click", createAndAssign);
  btnLogout.addEventListener("click", logout);

  // estado inicial
  setUid(null);
  setClient("—", "—");
  setStatus("Listo. Cerrá Barra si está abierta y leé una pulsera.", "idle");
}

init();
