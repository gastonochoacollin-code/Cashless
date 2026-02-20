// wwwroot/dashboard.js
// Requiere common.js (apiJson, apiFetch, requireSession, getSession, clearSession, $, getFestivalId, setFestivalId)

const session = requireSession();
let usersDebugState = null;

function setMsg(t, err = false){
  const el = $("msg");
  if(!el) return;
  el.textContent = t || "";
  el.style.color = err ? "#ff5a5a" : "";
}

function pill(elId, ok, text, warn = false){
  const el = $(elId);
  if(!el) return;
  el.textContent = text;
  el.className = "pill " + (warn ? "warn" : (ok ? "ok" : "bad"));
}

function setStatus(elId, ok, text, msg, warn = false){
  pill(elId, ok, text, warn);
  const msgEl = $(elId + "Msg");
  if(msgEl) msgEl.textContent = msg || "";
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

async function fetchUsersFirstAvailable(){
  const endpoints = [
    "/api/users",
    "/users",
    "/api/admin/users",
    "/api/admin/list-users"
  ];

  for(const ep of endpoints){
    try{
      const res = await apiFetch(ep, { method:"GET" });
      const status = res.status;
      let body = null;

      if(status === 401){
        usersDebugState = { endpoint: ep, status, example: null };
        setStatus("stUsers", false, "NO", "SesiÃ³n expirada");
        return { ok:false, status, endpoint: ep, data: [] };
      }

      if(status === 200){
        const text = await res.text();
        try{ body = text ? JSON.parse(text) : null; }catch{ body = text; }
        const list = normalizeUsers(body);
        usersDebugState = { endpoint: ep, status, example: list[0] || null };
        return { ok:true, status, endpoint: ep, data: list, raw: body };
      }

      if(status === 404){
        continue;
      }

      const errText = await res.text();
      usersDebugState = { endpoint: ep, status, example: null };
      return { ok:false, status, endpoint: ep, error: errText || `HTTP ${status}`, data: [] };
    }catch(e){
      usersDebugState = { endpoint: ep, status: 0, example: null };
      return { ok:false, status: 0, endpoint: ep, error: e?.message || String(e), data: [] };
    }
  }

  usersDebugState = { endpoint: "(ninguno)", status: 404, example: null };
  return { ok:false, status: 404, endpoint: "(ninguno)", error: "No disponible", data: [] };
}

async function tryUserCount(){
  const candidates = [
    "/api/users/count",
    "/api/users/summary",
    "/users/count",
    "/users/summary"
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
    if(activeName) activeName.textContent = "â€”";
    setStatus("stFestivals", false, "ERROR", res.error || "No disponible");
    return;
  }

  const list = res.data || [];
  if(select) select.innerHTML = "";

  if(list.length === 0){
    if(select) select.innerHTML = `<option value="">Sin festivales</option>`;
    if(activeName) activeName.textContent = "â€”";
    setStatus("stFestivals", true, "OK", "Sin festivales", true);
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
    activeName.textContent = activeLabel || "â€”";
  }

  setStatus("stFestivals", true, "OK", activeLabel ? `Activo: ${activeLabel}` : "OK");
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
    setMsg("Festival seleccionado (sin endpoint de activaciÃ³n)");
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

    $("lastUid").textContent = uid || "â€”";
    $("kpiNfc").textContent = uid || "â€”";

    if(!uid){
      setStatus("stUid", true, "OK", "Sin UID", true);
      return null;
    }

    try{
      const card = await apiGetCardByUid(uid);
      const userName = card?.userName || "Usuario";
      const balance = Number(card?.balance ?? 0);
      setStatus("stUid", true, "OK", `UID detectado Â· ${userName} Â· ${money(balance)}`);
    }catch(e){
      const msg = e?.message || "No asignada";
      const notAssigned = /no existe|no asignada|not found/i.test(msg);
      setStatus("stUid", true, "OK", notAssigned ? "UID detectado Â· sin usuario asignado" : `UID detectado Â· ${msg}`, notAssigned);
    }

    return uid;
  }catch(e){
    setStatus("stUid", false, "ERROR", e?.message || "No disponible");
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
    setStatus("stAreas", true, "OK", `${active} activas de ${areas.length}`);
    return;
  }

  $("kpiAreas").textContent = "â€”";
  $("kpiAreasTotal").textContent = "â€”";
  setStatus("stAreas", false, "ERROR", a.error || "No disponible");
}

async function loadUsers(){
  const res = await fetchUsersFirstAvailable();

  if(res.ok){
    const list = sortUsers(res.data || []);
    const countFromApi = await tryUserCount();
    const count = (typeof countFromApi === "number") ? countFromApi : list.length;

    $("kpiUsers").textContent = String(count);

    let totalSold = 0;
    let totalBalance = 0;
    for(const x of list){
      const spent = Number(x.totalSpent ?? x.TotalSpent ?? 0);
      const bal = Number(x.balance ?? x.Balance ?? 0);
      totalSold += spent;
      totalBalance += bal;
    }

    $("kpiSold").textContent = money(totalSold);
    $("kpiBalanceTotal").textContent = money(totalBalance);

    const top10 = list.slice(0,10);
    const tbody = $("recentUsers");
    tbody.innerHTML = "";

    for(const x of top10){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${x.id ?? x.Id ?? "â€”"}</td>
        <td>${(x.name ?? x.Name) || "â€”"}</td>
        <td>${money(x.balance ?? x.Balance)}</td>
        <td>${money(x.totalSpent ?? x.TotalSpent)}</td>
      `;
      tbody.appendChild(tr);
    }

    setStatus("stUsers", true, "OK", `Endpoint: ${res.endpoint}`);
    return;
  }

  $("kpiUsers").textContent = "â€”";
  $("kpiSold").textContent = "â€”";
  $("kpiBalanceTotal").textContent = "â€”";
  $("recentUsers").innerHTML = "";

  if(res.status === 401){
    setStatus("stUsers", false, "NO", "SesiÃ³n expirada");
    return;
  }

  if(res.status === 404){
    setStatus("stUsers", false, "ERROR", "Endpoint no disponible");
    return;
  }

  setStatus("stUsers", false, "ERROR", res.error || "No disponible");
}

function loadSession(){
  if(session?.name){
    const area = session.area ? String(session.area) : "â€”";
    const role = session.role ? String(session.role) : "â€”";
    $("who").textContent = `Operador: ${session.name} Â· Ãrea: ${area} Â· Rol: ${role}`;
    $("kpiOp").textContent = session.name;
    $("kpiRole").textContent = role;
    setStatus("stSession", true, "OK", "SesiÃ³n vÃ¡lida");
  }else{
    $("who").textContent = "SesiÃ³n no encontrada";
    setStatus("stSession", false, "NO", "Sin sesiÃ³n");
  }
}

async function loadAll(){
  setMsg("Cargando datos...");
  loadSession();

  await Promise.all([
    loadAreas(),
    loadUsers(),
    loadFestivals()
  ]);

  await testLastUid();
  setMsg("Listo");
}

$("btnReload").addEventListener("click", ()=> loadAll().catch(e=>setMsg(e.message,true)));
$("btnTestUid").addEventListener("click", ()=> testLastUid());
$("btnFestivalActivate")?.addEventListener("click", ()=> activateFestival());

$("btnLogout").addEventListener("click", ()=>{
  try{ clearSession(); }catch{}
  location.href = "/login.html";
});

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


