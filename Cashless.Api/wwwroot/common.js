// wwwroot/common.js
const API = ""; // mismo host

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

// ---------- API ----------
async function apiFetch(path, options = {}){
  const s = requireSession();
  const headers = {
    "Content-Type": "application/json",
    "X-Operator-Id": String(s.operatorId),
    "X-Operator-Token": String(s.token),
    ...(options.headers || {})
  };
  return fetch(`${API}${path}`, { ...options, headers });
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
