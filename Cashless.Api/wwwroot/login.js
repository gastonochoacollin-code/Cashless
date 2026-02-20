// wwwroot/login.js
// Compatible con common.js (NO redeclara $)

const el = (id) => document.getElementById(id);

const SESSION_KEY = "cashless.session";

function setMsg(t, cls="muted"){
  const m = el("msg");
  if(!m) return;
  m.className = "status " + cls;
  m.textContent = t || "";
}
function setErr(t){
  const e = el("err");
  if(!e) return;
  e.textContent = t || "";
}

function getSession(){
  try{
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}
function saveSession(s){
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function renderSession(){
  const s = getSession();
  const sess = el("sess");
  const go = el("btnGoDash");
  if(!sess || !go) return;

  if(s?.operatorId && s?.token){
    sess.textContent = `Sesión: ${s.name || "Operador"} · ${s.role || ""}`;
    go.disabled = false;
  }else{
    sess.textContent = "Sesión: (ninguna)";
    go.disabled = true;
  }
}

async function fetchJsonWithTimeout(url, opts={}, ms=8000){
  const ctrl = new AbortController();
  const t = setTimeout(()=> ctrl.abort(), ms);
  try{
    const res = await fetch(url, { ...opts, signal: ctrl.signal, cache:"no-store" });
    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { ok: res.ok, status: res.status, data };
  } finally {
    clearTimeout(t);
  }
}

async function loadOperators(){
  setErr("");
  setMsg("Cargando operadores…");
  el("btnLogin").disabled = true;
  el("btnReloadOps").disabled = true;

  try{
    const r = await fetchJsonWithTimeout("/ops", {}, 8000);
    if(!r.ok) throw new Error(`No pude cargar /ops (${r.status})`);

    const ops = Array.isArray(r.data) ? r.data : [];
    const active = ops.filter(o => o && o.isActive !== false);

    const sel = el("opSelect");
    sel.innerHTML = "";

    if(active.length === 0){
      setMsg("");
      setErr("No hay operadores activos (o /ops devolvió vacío).");
      return;
    }

    for(const o of active){
      const opt = document.createElement("option");
      opt.value = o.id;
      opt.textContent = `${o.name} · ${o.role}${o.area ? " · " + o.area : ""}`;
      sel.appendChild(opt);
    }

    setMsg(`Operadores cargados ✅ (${active.length})`, "ok");
  } catch(e){
    setMsg("", "muted");
    setErr(e?.name === "AbortError"
      ? "Timeout cargando /ops. Revisa que el server esté accesible."
      : (e.message || String(e)));
  } finally {
    el("btnLogin").disabled = false;
    el("btnReloadOps").disabled = false;
  }
}

async function doLogin(){
  setErr("");

  const operatorId = parseInt(el("opSelect").value, 10);
  const pin = (el("pin").value || "").trim();

  if(!operatorId) return setErr("Selecciona un operador.");
  if(!pin) return setErr("NIP requerido.");

  el("btnLogin").disabled = true;
  el("btnReloadOps").disabled = true;
  setMsg("Validando NIP…");

  try{
    const r = await fetchJsonWithTimeout("/auth/login", {
      method:"POST",
      headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ operatorId, pin })
    }, 8000);

    if(!r.ok){
      const msg = (r.data && typeof r.data === "object" && r.data.message)
        ? r.data.message
        : `Login falló (${r.status})`;
      throw new Error(msg);
    }

   // Normaliza respuesta por si viene anidada como { data: { token, ... } }
const payload = (r.data && typeof r.data === "object" && r.data.data && typeof r.data.data === "object")
  ? r.data.data
  : r.data;

saveSession(payload);
    el("pin").value = "";
    renderSession();
    setMsg("Login correcto ✅ (ya puedes ir al Dashboard)", "ok");
  } catch(e){
    setMsg("", "muted");
    setErr(e?.name === "AbortError"
      ? "Timeout en /auth/login. Revisa el servidor."
      : (e.message || String(e)));
  } finally {
    el("btnLogin").disabled = false;
    el("btnReloadOps").disabled = false;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  renderSession();

  el("btnReloadOps").addEventListener("click", loadOperators);
  el("btnLogin").addEventListener("click", doLogin);
  el("pin").addEventListener("keydown", (e)=>{ if(e.key === "Enter") doLogin(); });

  el("btnGoDash").addEventListener("click", ()=>{
    window.location.href = "/dashboard.html";
  });

  // Carga 1 vez al abrir
  loadOperators();
});
