// wwwroot/common.js
const API_BASE = window.location.origin;
const API = API_BASE; // compat

function $(id){ return document.getElementById(id); }

// ---------- Session ----------
function getSession(){
  const raw = localStorage.getItem("cashless.session");
  if(!raw) return null;
  try{ return JSON.parse(raw); }catch{ return null; }
}
function saveSession(s){
  localStorage.setItem("cashless.session", JSON.stringify(s));
}
function clearSession(){
  localStorage.removeItem("cashless.session");
}
function requireSession(){
  const s = getSession();
  if(!s || !s.operatorId || !s.token){
    window.location.href = "/login.html";
    throw new Error("No session");
  }
  return s;
}

// ---------- Festival ----------
function getFestivalId(){
  return localStorage.getItem("cashless.festivalId") || "";
}
function setFestivalId(id){
  if(!id) localStorage.removeItem("cashless.festivalId");
  else localStorage.setItem("cashless.festivalId", String(id));

  const s = getSession();
  if(s && typeof s === "object"){
    if(id) s.festivalId = String(id);
    else delete s.festivalId;
    saveSession(s);
  }
}

function normalizeUid(uid){
  return String(uid || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
}

function getTerminalId(){
  const tid = (sessionStorage.getItem("cashless.terminalId") || "").trim();
  return tid || "DEFAULT";
}

function apiHeaders(extraHeaders = {}){
  const s = requireSession();
  return {
    "Content-Type": "application/json",
    "X-Operator-Id": String(s.operatorId),
    "X-Operator-Token": String(s.token),
    ...(s.tenantId ? { "X-Tenant-Id": String(s.tenantId) } : {}),
    ...(s.token ? { "Authorization": `Bearer ${s.token}` } : {}),
    ...(getFestivalId() ? { "X-Festival-Id": String(getFestivalId()) } : {}),
    ...(extraHeaders || {})
  };
}

// ---------- API ----------
function withTimeout(ms){
  const controller = new AbortController();
  const timer = setTimeout(()=> controller.abort(), ms);
  return { signal: controller.signal, cancel: ()=> clearTimeout(timer) };
}

async function apiFetch(path, options = {}){
  requireSession();
  const timeoutMs = options.timeoutMs ?? 12000;
  const { signal, cancel } = withTimeout(timeoutMs);
  const method = String(options?.method || "GET").toUpperCase();
  const url = `${API_BASE}${path}`;

  try{
    const res = await fetch(url, {
      ...options,
      headers: apiHeaders(options.headers || {}),
      cache: "no-store",
      signal
    });

    if(res.status === 401){
      clearSession();
      window.location.href = "/login.html";
    }

    return res;
  }catch(e){
    if(e && typeof e === "object"){
      e.status = Number(e.status || 0);
      e.statusText = String(e.statusText || e.name || "NetworkError");
      e.data = e.data ?? null;
      e.url = e.url || url;
      e.method = e.method || method;
    }
    throw e;
  }finally{
    cancel();
  }
}

async function apiJson(path, options = {}){
  const res = await apiFetch(path, options);
  const text = await res.text();

  let data = null;
  try{ data = text ? JSON.parse(text) : null; }
  catch{ data = { message: text }; }

  if(!res.ok){
    const msg = data?.message || res.statusText || `Error ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.statusText = res.statusText;
    err.data = data;
    err.url = `${API_BASE}${path}`;
    err.method = String(options?.method || "GET").toUpperCase();
    throw err;
  }
  return data;
}

async function apiGetLastUid(terminalId = ""){
  const tid = String(terminalId || "").trim() || getTerminalId();
  const qs = `?terminalId=${encodeURIComponent(tid)}`;
  const data = await apiJson(`/api/last-uid${qs}`, { method: "GET" });
  return normalizeUid(data?.uid || "");
}

async function apiGetCardByUid(uid){
  const clean = normalizeUid(uid);
  if(!clean) throw new Error("UID requerido");
  return await apiJson(`/api/cards/${encodeURIComponent(clean)}`, { method: "GET" });
}

function renderAppMenu(containerId, currentPath = ""){
  const host = $(containerId);
  if(!host) return;
  const brandHtml = `<div class="brand" style="margin-right:8px">
    <img src="/assets/logo-horizontal.png" alt="Cashless Logo" class="logo-horizontal">
  </div>`;

  const links = [
    ["Dashboard", "/dashboard.html"],
    ["Cajero", "/dashboard-caja/"],
    ["POS", "/pos.html"],
    ["Barras", "/barras.html"],
    ["Menus", "/menus.html"],
    ["Colaboradores", "/operators.html"],
    ["Usuarios", "/usuarios.html"],
    ["Recargas", "/recargas.html"],
    ["Ventas", "/ventas.html"],
    ["Festivales", "/festivales.html"],
    ["Mapa", "/app-map.html"],
    ["Reportes", "/reports.html"],
    ["Reportes generales", "/reports-summary.html"]
  ];

  const roleRaw = String(getSession()?.role || getSession()?.Role || "").trim().toLowerCase();
  const role = roleRaw.replace(/[\s_\-]/g, "");
  const isAdmin = role === "admin" || role === "superadmin";
  const isBarManager = role === "jefedebarra" || role === "jefedestand";
  const isCashier = role === "cashier" || role === "cajero" || role === "jefedecaja";

  const allowByRole = {
    admin: new Set(links.map(([label]) => label)),
    bar: new Set(["Dashboard", "POS", "Barras", "Menus", "Recargas", "Reportes"]),
    cashier: new Set(["Cajero", "Recargas", "Reportes (Cajero)"])
  };

  const allowed = links.filter(([label]) => {
    if(isAdmin) return allowByRole.admin.has(label);
    if(isBarManager) return allowByRole.bar.has(label);
    if(isCashier) return allowByRole.cashier.has(label);
    return label === "Dashboard" || label === "POS" || label === "Recargas";
  });

  const normalizePath = (p) => String(p || "").toLowerCase();
  const current = normalizePath(currentPath || window.location.pathname);
  const baseStyle = "display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:12px;background:#2a2a3a;color:#fff;text-decoration:none;font-weight:800;border:1px solid rgba(255,255,255,.08)";

  host.innerHTML = brandHtml + allowed.map(([label, href]) => {
    const active = current.endsWith(normalizePath(href)) ? ";outline:1px solid rgba(47,124,255,.6);background:rgba(47,124,255,.18)" : "";
    return `<a class="btn alt" href="${href}" style="${baseStyle}${active}">${label}</a>`;
  }).join("");
}

function renderCashierMenu(containerId, currentPath = ""){
  const host = $(containerId);
  if(!host) return;
  const brandHtml = `<div class="brand" style="margin-right:8px">
    <img src="/assets/logo-horizontal.png" alt="Cashless Logo" class="logo-horizontal">
  </div>`;

  const links = [
    ["Cajero", "/dashboard-caja/"],
    ["Recargas", "/recargas.html"],
    ["Reportes (Cajero)", "/dashboard-caja/reportes.html"],
    ["Cerrar sesion", "__logout__"]
  ];

  const normalizePath = (p) => String(p || "").toLowerCase();
  const current = normalizePath(currentPath || window.location.pathname);
  const baseStyle = "display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:12px;background:#2a2a3a;color:#fff;text-decoration:none;font-weight:800;border:1px solid rgba(255,255,255,.08)";

  host.innerHTML = brandHtml + links.map(([label, href]) => {
    const active = current.endsWith(normalizePath(href)) ? ";outline:1px solid rgba(47,124,255,.6);background:rgba(47,124,255,.18)" : "";
    return `<a class="btn alt" href="${href}" style="${baseStyle}${active}">${label}</a>`;
  }).join("");

  host.querySelectorAll("a[href='__logout__']").forEach(a => {
    a.addEventListener("click", (ev) => {
      ev.preventDefault();
      clearSession();
      window.location.href = "/login.html";
    });
  });
}
