const session = requireSession();
const role = String(session?.role || session?.Role || "");
const isAdmin = role === "Admin" || role === "SuperAdmin";

if(isAdmin){
  window.location.href = "/operators.html";
  throw new Error("Admin role");
}

function $(id){ return document.getElementById(id); }

function setSessionInfo(){
  const name = session?.name || session?.operatorName || "Operador";
  const roleText = role ? ` · ${role}` : "";
  const host = $("sessionInfo");
  if(host) host.textContent = `Sesión: ${name}${roleText}`;
}

function disableButton(btn, hintEl, msg){
  if(btn){
    btn.disabled = true;
    btn.title = msg || "pendiente";
  }
  if(hintEl) hintEl.textContent = msg || "pendiente";
}

async function wireButton(btnId, hintId, url){
  const btn = $(btnId);
  const hint = hintId ? $(hintId) : null;
  if(!btn) return;
  try{
    const res = await fetch(url, { method: "GET", cache: "no-store" });
    if(!res.ok) throw new Error("not found");
    btn.addEventListener("click", ()=> window.location.href = url);
  }catch{
    disableButton(btn, hint, "pendiente");
  }
}

function setupCatalogAccess(){
  const card = $("catalogCard");
  const btn = $("btnCatalog");
  if(role !== "JefeDeBarra"){
    if(card) card.style.display = "none";
    return;
  }
  if(btn){
    btn.addEventListener("click", ()=> window.location.href = "/menus.html");
  }
}

async function refreshLastUid(){
  const status = $("uidStatus");
  const value = $("uidValue");
  if(status) status.textContent = "Leyendo...";
  try{
    const data = await apiJson("/api/last-uid", { method: "GET" });
    const uid = String(data?.uid || "").trim();
    if(value) value.textContent = uid || "—";
    if(status) status.textContent = "OK";
  }catch(e){
    console.error("ops uid error:", e);
    if(status) status.textContent = "sin datos";
  }
}

setSessionInfo();
wireButton("btnPos", "posHint", "/pos.html");
wireButton("btnCashier", "cashierHint", "/cashier.html");
setupCatalogAccess();
refreshLastUid();
setInterval(refreshLastUid, 2000);

$("btnLogout")?.addEventListener("click", ()=>{
  try{ clearSession(); }catch{}
  window.location.href = "/login.html";
});
