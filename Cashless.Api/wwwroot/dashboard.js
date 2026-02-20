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

async function testLastUid(){
  // /last-uid es público
  try{
    const res = await fetch("/last-uid", { cache:"no-store" });

    if(!res.ok){
      // 404 = OK pero no hay UID
      pill("stUid", true, "OK (sin UID)");
      $("lastUid").textContent = "—";
      $("kpiNfc").textContent = "—";
      return null;
    }

    const j = await res.json();
    const uid = (j?.uid || "").trim().toUpperCase();

    $("lastUid").textContent = uid || "—";
    $("kpiNfc").textContent = uid || "—";
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
    $("who").textContent = `Hola, ${s.name} · Área: ${s.area || "—"} · Rol: ${s.role || "—"}`;
    $("kpiOp").textContent = s.name;
    $("kpiRole").textContent = s.role || "—";
    pill("stSession", true, "OK");
  }else{
    $("who").textContent = "Sesión no encontrada";
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
    $("kpiAreas").textContent = "—";
    $("kpiAreasTotal").textContent = "—";
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
        <td>${(x.name ?? x.Name) || "—"}</td>
        <td>${money(x.balance ?? x.Balance)}</td>
        <td>${money(x.totalSpent ?? x.TotalSpent)}</td>
      `;
      tbody.appendChild(tr);
    }

    pill("stUsers", true, "OK");
  }else{
    $("kpiUsers").textContent = "—";
    $("kpiSold").textContent = "—";
    $("kpiBalanceTotal").textContent = "—";
    $("recentUsers").innerHTML = "";
    pill("stUsers", false, "ERROR");
  }

  await testLastUid();
  setMsg("Listo ✅");
}

$("btnReload").addEventListener("click", ()=> load().catch(e=>setMsg(e.message,true)));
$("btnTestUid").addEventListener("click", ()=> testLastUid());
$("btnLogout").addEventListener("click", ()=>{
  try{ clearSession(); }catch{}
  location.href = "/login.html";
});

load();
setInterval(testLastUid, 1500);
