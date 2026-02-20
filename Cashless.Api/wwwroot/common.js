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
}

function normalizeUid(uid){
  return String(uid || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
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

  try{
    const res = await fetch(`${API_BASE}${path}`, {
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
    const msg = data?.message || `Error ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

async function apiGetLastUid(){
  const data = await apiJson("/api/last-uid", { method: "GET" });
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

  const links = [
    ["Dashboard", "/dashboard.html"],
    ["POS", "/barra.html"],
    ["Barras", "/barras.html"],
    ["Menus", "/menus.html"],
    ["Colaboradores", "/operators.html"],
    ["Usuarios", "/usuarios.html"],
    ["Reportes", "/reports.html"],
    ["Admin", "/admin.html"]
  ];

  const normalizePath = (p) => String(p || "").toLowerCase();
  const current = normalizePath(currentPath || window.location.pathname);
  const baseStyle = "display:inline-flex;align-items:center;gap:8px;padding:10px 14px;border-radius:12px;background:#2a2a3a;color:#fff;text-decoration:none;font-weight:800;border:1px solid rgba(255,255,255,.08)";

  host.innerHTML = links.map(([label, href]) => {
    const active = current.endsWith(normalizePath(href)) ? ";outline:1px solid rgba(47,124,255,.6);background:rgba(47,124,255,.18)" : "";
    return `<a class="btn alt" href="${href}" style="${baseStyle}${active}">${label}</a>`;
  }).join("");
}
