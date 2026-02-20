// wwwroot/dashboard.js
// Requiere common.js (apiJson, requireSession, getSession, clearSession, $)

requireSession();

function setMsg(t, err=false){
  const el = $("msg");
  if(!el) return;
  el.textContent = t || "";
  el.style.color = err ? "#ff5a5a" : "";
}

function pill(elId, ok, text){
  const el = $(elId);
  if(!el) return;
  el.textContent = text;
  el.className = "pill " + (ok ? "ok" : "bad");
}

function money(n){
  const x = Number(n || 0);
  return "$" + x.toFixed(2);
}

async function safeJson(url, opts){
  try{
    const data = await apiJson(url, opts);
    return { ok:true, data };
  }catch(e){
    return { ok:false, error: e?.message || String(e) };
  }
}

async function loadFestivals(){
  const select = $("festivalSelect");
  if(!select) return;

  select.innerHTML = `<option value="">Cargando...</option>`;

  const res = await safeJson("/api/festivals");
  if(!res.ok){
    select.innerHTML = `<option value="">Error al cargar</option>`;
    return;
  }

  const list = res.data || [];
  select.innerHTML = "";

  if(list.length === 0){
    select.innerHTML = `<option value="">Sin festivales</option>`;
    return;
  }

  let activeId = "";
  for(const f of list){
    const id = f.id ?? f.Id;
    const name = f.name ?? f.Name ?? `Festival ${id}`;
    const isActive = (f.isActive ?? f.IsActive) === true;
    if(isActive) activeId = String(id);
    const opt = document.createElement("option");
    opt.value = String(id);
    opt.textContent = isActive ? `${name} (activo)` : name;
    select.appendChild(opt);
  }

  if(activeId) select.value = activeId;
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
    setMsg("No se pudo activar el festival", true);
    return;
  }

  await loadFestivals();
  setMsg("Festival activado");
}

async function testLastUid(){
  // /last-uid es pÃºblico
  try{
    const res = await fetch("/last-uid", { cache:"no-store" });

    if(!res.ok){
      // 404 = OK pero no hay UID
      pill("stUid", true, "OK (sin UID)");
      $("lastUid").textContent = "â€”";
      $("kpiNfc").textContent = "â€”";
      return null;
    }

    const j = await res.json();
    const uid = (j?.uid || "").trim().toUpperCase();

    $("lastUid").textContent = uid || "â€”";
    $("kpiNfc").textContent = uid || "â€”";
    pill("stUid", true, "OK");

    return uid;
  }catch{
    pill("stUid", false, "ERROR");
    return null;
  }
}

async function load(){
  const s = getSession();
  if(s?.name){
    $("who").textContent = `Hola, ${s.name} Â· Ãrea: ${s.area || "â€”"} Â· Rol: ${s.role || "â€”"}`;
    $("kpiOp").textContent = s.name;
    $("kpiRole").textContent = s.role || "â€”";
    pill("stSession", true, "OK");
  }else{
    $("who").textContent = "SesiÃ³n no encontrada";
    pill("stSession", false, "NO");
  }

  setMsg("Cargando datos...");

  // Areas (protegido)
  const a = await safeJson("/api/areas");
  if(a.ok){
    const areas = a.data || [];
    const active = areas.filter(x => (x.isActive ?? x.IsActive) === true).length;
    $("kpiAreas").textContent = String(active);
    $("kpiAreasTotal").textContent = String(areas.length);
    pill("stAreas", true, "OK");
  }else{
    $("kpiAreas").textContent = "â€”";
    $("kpiAreasTotal").textContent = "â€”";
    pill("stAreas", false, "ERROR");
  }

  // Users (protegido) -> KPIs + tabla + total vendido
  const u = await safeJson("/users");
  if(u.ok){
    const users = u.data || [];
    $("kpiUsers").textContent = String(users.length);

    let totalSold = 0;
    let totalBalance = 0;

    for(const x of users){
      const spent = Number(x.totalSpent ?? x.TotalSpent ?? 0);
      const bal = Number(x.balance ?? x.Balance ?? 0);
      totalSold += spent;
      totalBalance += bal;
    }

    $("kpiSold").textContent = money(totalSold);
    $("kpiBalanceTotal").textContent = money(totalBalance);

    const top10 = users.slice(0,10);
    const tbody = $("recentUsers");
    tbody.innerHTML = "";

    for(const x of top10){
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="mono">${x.id ?? x.Id}</td>
        <td>${(x.name ?? x.Name) || "â€”"}</td>
        <td>${money(x.balance ?? x.Balance)}</td>
        <td>${money(x.totalSpent ?? x.TotalSpent)}</td>
      `;
      tbody.appendChild(tr);
    }

    pill("stUsers", true, "OK");
  }else{
    $("kpiUsers").textContent = "â€”";
    $("kpiSold").textContent = "â€”";
    $("kpiBalanceTotal").textContent = "â€”";
    $("recentUsers").innerHTML = "";
    pill("stUsers", false, "ERROR");
  }

  await loadFestivals();
  await testLastUid();
  setMsg("Listo âœ…");
}

$("btnReload").addEventListener("click", ()=> load().catch(e=>setMsg(e.message,true)));
$("btnTestUid").addEventListener("click", ()=> testLastUid());
$("btnFestivalActivate")?.addEventListener("click", ()=> activateFestival());

$("btnLogout").addEventListener("click", ()=>{
  try{ clearSession(); }catch{}
  location.href = "/login.html";
});

load();
setInterval(testLastUid, 1500);

