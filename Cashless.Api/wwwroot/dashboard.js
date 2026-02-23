// wwwroot/dashboard.js
// Requiere common.js (apiJson, apiFetch, requireSession, getSession, clearSession, $, getFestivalId, setFestivalId)

const session = requireSession();
const roleRaw = String(session?.role || session?.Role || "").trim();
const roleNorm = roleRaw.toLowerCase().replace(/[\s_\-]/g, "");

function isAdminOrSuper(){
  return roleNorm === "admin" || roleNorm === "superadmin";
}

function isBoss(){
  return roleNorm.includes("jefe");
}

function isCashier(){
  return roleNorm === "cajero" || roleNorm === "cashier";
}

function isSeller(){
  return roleNorm === "vendedor";
}

function isJefeDeBarra(){
  return roleNorm === "jefedebarra";
}

function canPos(){
  return isSeller() || isJefeDeBarra() || isBoss() || isAdminOrSuper();
}

function canCaja(){
  return isCashier() || isBoss() || isAdminOrSuper();
}

function canReports(){
  return isBoss() || isAdminOrSuper();
}

function canAdmin(){
  return isAdminOrSuper();
}

function canBarsCatalog(){
  return isJefeDeBarra() || roleNorm === "jefeoperativo" || isAdminOrSuper();
}

function setMsg(t, err = false){
  const el = $("msg");
  if(!el) return;
  el.textContent = t || "";
  el.style.color = err ? "#ff5a5a" : "";
}

function money(n){
  const x = Number(n || 0);
  return "$" + x.toFixed(2);
}

async function safeJson(path, opts){
  try{
    const data = await apiJson(path, opts || {});
    return { ok:true, data };
  }catch(e){
    return { ok:false, error: e?.message || String(e) };
  }
}

function normalizeUsers(payload){
  if(Array.isArray(payload)) return payload;
  if(payload && typeof payload === "object"){
    if(Array.isArray(payload.items)) return payload.items;
    if(Array.isArray(payload.data)) return payload.data;
  }
  return [];
}

function parseDate(v){
  if(!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function sortUsers(list){
  const withDate = list.some(u => parseDate(u.createdAt ?? u.CreatedAt ?? u.updatedAt ?? u.UpdatedAt));
  if(withDate){
    return [...list].sort((a,b)=>{
      const da = parseDate(a.updatedAt ?? a.UpdatedAt ?? a.createdAt ?? a.CreatedAt) || 0;
      const db = parseDate(b.updatedAt ?? b.UpdatedAt ?? b.createdAt ?? b.CreatedAt) || 0;
      return db - da;
    });
  }
  return [...list].sort((a,b)=>{
    const ia = Number(a.id ?? a.Id ?? 0);
    const ib = Number(b.id ?? b.Id ?? 0);
    return ib - ia;
  });
}

async function getUserCount(){
  const candidates = [
    "/api/users/count",
    "/api/users/summary"
  ];

  for(const ep of candidates){
    try{
      const res = await apiFetch(ep, { method:"GET" });
      if(res.status !== 200) continue;
      const text = await res.text();
      let body = null;
      try{ body = text ? JSON.parse(text) : null; }catch{ body = text; }
      if(typeof body === "number") return body;
      if(body && typeof body === "object"){
        if(typeof body.count === "number") return body.count;
        if(typeof body.total === "number") return body.total;
      }
    }catch{ /* ignore */ }
  }

  return null;
}

async function loadFestivals(){
  const select = $("festivalSelect");
  const activeName = $("festivalActiveName");
  if(select){
    select.innerHTML = `<option value="">Cargando...</option>`;
  }

  const res = await safeJson("/api/festivals");
  if(!res.ok){
    if(select) select.innerHTML = `<option value="">No disponible</option>`;
    if(activeName) activeName.textContent = "-";
    return;
  }

  const list = res.data || [];
  if(select) select.innerHTML = "";

  if(list.length === 0){
    if(select) select.innerHTML = `<option value="">Sin festivales</option>`;
    if(activeName) activeName.textContent = "-";
    return;
  }

  let activeId = "";
  let activeLabel = "";
  for(const f of list){
    const id = f.id ?? f.Id;
    const name = f.name ?? f.Name ?? `Festival ${id}`;
    const isActive = (f.isActive ?? f.IsActive) === true;
    if(isActive){
      activeId = String(id);
      activeLabel = name;
    }
    if(select){
      const opt = document.createElement("option");
      opt.value = String(id);
      opt.textContent = isActive ? `${name} (activo)` : name;
      select.appendChild(opt);
    }
  }

  const savedId = getFestivalId();
  if(select){
    if(activeId) select.value = activeId;
    else if(savedId) select.value = savedId;
  }

  if(activeName){
    activeName.textContent = activeLabel || "-";
  }
}

async function activateFestival(){
  const select = $("festivalSelect");
  const id = select?.value;
  if(!id){
    setMsg("Selecciona un festival", true);
    return;
  }

  const res = await safeJson(`/api/festivals/${id}/activate`, { method:"POST" });
  if(!res.ok){
    setFestivalId(id);
    setMsg("Festival seleccionado (sin endpoint de activacion)");
    await loadFestivals();
    return;
  }

  setFestivalId(id);
  await loadFestivals();
  setMsg("Festival activado");
}

async function testLastUid(){
  try{
    const uid = await apiGetLastUid();

    $("lastUid").textContent = uid || "-";
    $("kpiNfc").textContent = uid || "-";

    return uid;
  }catch(e){
    $("lastUid").textContent = "-";
    $("kpiNfc").textContent = "-";
    return null;
  }
}

async function loadAreas(){
  const a = await safeJson("/api/areas");
  if(a.ok){
    const areas = a.data || [];
    const active = areas.filter(x => (x.isActive ?? x.IsActive) === true).length;
    $("kpiAreas").textContent = String(active);
    $("kpiAreasTotal").textContent = String(areas.length);
    return;
  }

  $("kpiAreas").textContent = "-";
  $("kpiAreasTotal").textContent = "-";
}

async function loadUsers(){
  let list = [];
  try{
    const res = await apiJson("/api/users", { method:"GET" });
    list = normalizeUsers(res);
  }catch(e){
    list = [];
  }

  const sorted = sortUsers(list || []);
  const countFromApi = await getUserCount();
  const count = (typeof countFromApi === "number") ? countFromApi : sorted.length;

  $("kpiUsers").textContent = String(count);

  let totalSold = 0;
  for(const x of sorted){
    const spent = Number(x.totalSpent ?? x.TotalSpent ?? 0);
    totalSold += spent;
  }

  $("kpiSold").textContent = money(totalSold);

  const top10 = sorted.slice(0,10);
  const tbody = $("recentUsers");
  tbody.innerHTML = "";

  for(const x of top10){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="mono">${x.id ?? x.Id ?? "-"}</td>
      <td>${(x.name ?? x.Name) || "-"}</td>
      <td>${money(x.balance ?? x.Balance)}</td>
      <td>${money(x.totalSpent ?? x.TotalSpent)}</td>
    `;
    tbody.appendChild(tr);
  }
}

function loadSession(){
  if(session?.name){
    const area = session.area ? String(session.area) : "-";
    const role = roleRaw || "-";
    $("who").textContent = `Operador: ${session.name} - Area: ${area} - Rol: ${role}`;
    $("kpiOp").textContent = session.name;
    $("kpiRole").textContent = role;
  }else{
    $("who").textContent = "Sesion no encontrada";
  }
}

function setVisible(id, visible){
  const node = $(id);
  if(!node) return;
  node.style.display = visible ? "" : "none";
}

function applyDashboardAccess(){
  const canPosV = canPos();
  const canCajaV = canCaja();
  const canReportsV = canReports();
  const canAdminV = canAdmin();
  const canBarsV = canBarsCatalog();

  setVisible("btnQuickPos", canPosV);
  setVisible("btnQuickCaja", canCajaV);
  setVisible("btnPos", canPosV);
  setVisible("btnCaja", canCajaV);

  setVisible("btnBarras", canBarsV);
  setVisible("btnMenus", canBarsV);
  setVisible("btnReports", canReportsV);

  setVisible("btnRecargas", canCajaV || canPosV || canBarsV || canAdminV);
  setVisible("btnOperators", canAdminV);
  setVisible("btnUsers", canAdminV);
  setVisible("btnAdminAssign", canAdminV);
}

async function loadAll(){
  setMsg("Cargando datos...");
  loadSession();
  applyDashboardAccess();

  await Promise.all([
    loadAreas(),
    loadUsers(),
    loadFestivals()
  ]);

  await testLastUid();
  setMsg("Listo");
}

$("btnReload").addEventListener("click", ()=> loadAll().catch(e=>setMsg(e.message,true)));
$("btnFestivalActivate")?.addEventListener("click", ()=> activateFestival());

$("btnLogout").addEventListener("click", ()=>{
  try{ clearSession(); }catch{}
  location.href = "/login.html";
});

renderAppMenu("appMenu", "/dashboard.html");
loadAll();
let uidPollHandle = null;

function startUidPolling(){
  if(uidPollHandle) return;
  uidPollHandle = setInterval(()=>{ testLastUid(); }, 2000);
}

function stopUidPolling(){
  if(!uidPollHandle) return;
  clearInterval(uidPollHandle);
  uidPollHandle = null;
}

document.addEventListener("visibilitychange", () => {
  if(document.hidden){
    stopUidPolling();
    return;
  }
  testLastUid();
  startUidPolling();
});

startUidPolling();
