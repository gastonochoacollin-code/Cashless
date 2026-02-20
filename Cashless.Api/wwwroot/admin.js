// wwwroot/admin.js

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
const userEmailEl = $("userEmail");
const userPhoneEl = $("userPhone");

let session = null;
let currentUid = null;

function setStatus(msg, kind = "idle"){
  statusEl.textContent = msg;
  statusEl.className = `status ${kind}`;
}

function setUid(uid){
  currentUid = normalizeUid(uid);
  uidEl.textContent = currentUid || "—";
  uidEl.classList.toggle("muted", !currentUid);
}

function setClient(name, balance){
  clientNameEl.textContent = name ?? "—";
  clientBalanceEl.textContent = (balance ?? "—");
}

function logout(){
  clearSession();
  window.location.href = "/login.html";
}

async function refreshCardInfo(){
  if(!currentUid) return;

  try{
    const data = await apiGetCardByUid(currentUid);
    setClient(data.userName, data.balance);
    setStatus(`✅ ${data.userName} · Saldo $${data.balance}`, "ok");
  }catch(e){
    const msg = String(e?.message || "");
    const notAssigned = /tarjeta no asignada|no asignada|card no existe|not found/i.test(msg);
    setClient("—", "—");
    if(notAssigned){
      setStatus(`UID leído (${currentUid}) · Tarjeta no asignada`, "bad");
    }else{
      setStatus(`Error resolviendo tarjeta: ${msg || "No disponible"}`, "bad");
    }
  }
}

async function readUid(){
  setStatus("Leyendo pulsera…", "idle");
  setClient("—", "—");

  try{
    const uid = await apiGetLastUid();
    if(!uid){
      setUid(null);
      setStatus("No hay pulsera leída aún.", "bad");
      return;
    }

    setUid(uid);
    await refreshCardInfo();
  }catch(e){
    setUid(null);
    setClient("—", "—");
    setStatus(e?.message || "No hay pulsera. Volvé a intentar.", "bad");
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
    const res = await apiJson("/api/topup", {
      method:"POST",
      body: JSON.stringify({ uid: currentUid, amount })
    });

    await refreshCardInfo();
    setStatus(`✅ Recarga OK · Nuevo saldo $${res.newBalance}`, "ok");
  }catch(e){
    setStatus(e?.message || "Error recargando", "bad");
  }
}

async function createAndAssign(){
  if(!currentUid) return setStatus("Primero leé la pulsera.", "bad");

  const name = (userNameEl.value || "").trim();
  const email = (userEmailEl?.value || "").trim();
  const phone = (userPhoneEl?.value || "").trim();

  if(!name) return setStatus("Escribí el nombre del cliente.", "bad");

  setStatus("Creando usuario…", "idle");

  try{
    const user = await apiJson("/api/users", {
      method:"POST",
      body: JSON.stringify({ name, email: email || null, phone: phone || null })
    });

    setStatus("Asignando pulsera…", "idle");

    await apiJson("/api/assign-card", {
      method:"POST",
      body: JSON.stringify({ userId: user.id, uid: currentUid })
    });

    await refreshCardInfo();
    setStatus(`✅ Asignado a ${name} (UserId ${user.id})`, "ok");
  }catch(e){
    setStatus(e?.message || "Error creando/asignando", "bad");
  }
}

function init(){
  if(jsDot) jsDot.classList.add("on");

  renderAppMenu("appMenu", "/admin.html");

  session = getSession();
  if(!session?.operatorId || !session?.token){
    setStatus("Sin sesión. Redirigiendo a login…", "bad");
    setTimeout(()=> window.location.href = "/login.html", 600);
    return;
  }

  sessionInfoEl.textContent = `${session.name} · ${session.role} · ${session.area ?? "-"}`;

  btnUid.addEventListener("click", readUid);
  btnTopup.addEventListener("click", topup);
  btnAssign.addEventListener("click", createAndAssign);
  btnLogout.addEventListener("click", logout);

  setUid(null);
  setClient("—", "—");
  setStatus("Listo. Leé una pulsera para consultar o asignar.", "idle");
}

init();
