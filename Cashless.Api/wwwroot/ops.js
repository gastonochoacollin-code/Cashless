const session = requireSession();
const role = String(session?.role || session?.Role || "");
const normalizedRole = role.trim().toLowerCase();
const isAdmin = normalizedRole === "admin" || normalizedRole === "superadmin";
const isCashier = normalizedRole === "cajero" || normalizedRole === "cashier";
const isJefeOperativo = normalizedRole === "jefeoperativo";

function $(id){ return document.getElementById(id); }

function setSessionInfo(){
  const name = session?.name || session?.operatorName || "Operador";
  const roleText = role ? ` · ${role}` : "";
  const host = $("sessionInfo");
  if(host) host.textContent = `Sesion: ${name}${roleText}`;
}

function disableButton(btn, hintEl, msg){
  if(btn){
    btn.disabled = true;
    btn.title = msg || "pendiente";
  }
  if(hintEl) hintEl.textContent = msg || "pendiente";
}

function wireButton(btnId, url){
  const btn = $(btnId);
  if(!btn) return;
  btn.addEventListener("click", ()=> window.location.href = url);
}

function setupCatalogAccess(){
  const card = $("catalogCard");
  const btn = $("btnCatalog");
  if(normalizedRole !== "jefedebarra"){
    if(card) card.style.display = "none";
    return;
  }
  if(btn){
    btn.addEventListener("click", ()=> window.location.href = "/menus.html");
  }
}

function setupCashierAccess(){
  const btn = $("btnCashier");
  const hint = $("cashierHint");
  if(!btn) return;

  if(isAdmin || isCashier || isJefeOperativo){
    btn.disabled = false;
    btn.title = "";
    if(hint) hint.textContent = "Turnos y cortes de caja";
    btn.addEventListener("click", ()=> window.location.href = "/dashboard-caja/reportes.html");
    return;
  }

  disableButton(btn, hint, "No autorizado para caja/cortes");
}

async function refreshLastUid(){
  const status = $("uidStatus");
  const value = $("uidValue");
  if(status) status.textContent = "Leyendo...";
  try{
    const uid = await apiGetLastUid();
    if(value) value.textContent = uid || "-";
    if(status) status.textContent = "OK";
  }catch(e){
    console.error("ops uid error:", e);
    if(status) status.textContent = "sin datos";
  }
}

setSessionInfo();
wireButton("btnPos", "/pos.html");
setupCatalogAccess();
setupCashierAccess();
refreshLastUid();
setInterval(refreshLastUid, 2000);

$("btnLogout")?.addEventListener("click", ()=>{
  try{ clearSession(); }catch{}
  window.location.href = "/login.html";
});

