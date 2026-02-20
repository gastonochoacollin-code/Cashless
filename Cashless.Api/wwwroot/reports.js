// wwwroot/reports.js
(() => {
  const el = (id) => document.getElementById(id);
  const SESSION_KEY = "cashless.session";

  function showErr(msg){
    const box = el("errBox");
    if(!box) return;
    box.style.display = msg ? "block" : "none";
    box.textContent = msg || "";
  }

  // ---------- auth ----------
  function getSession(){
    try{ return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); }
    catch{ return null; }
  }

  function getToken(){
    const s = getSession();
    return s?.token || null;
  }

  function authHeaders(){
    const h = { "Accept": "application/json" };
    const t = getToken();
    if (t) {
      h["Authorization"] = `Bearer ${t}`;
      h["X-Operator-Token"] = t;
    }
    const s = getSession();
    if (s?.operatorId) h["X-Operator-Id"] = String(s.operatorId);
    return h;
  }

  async function apiGet(url){
    const res = await fetch(url, {
      headers: authHeaders(),
      credentials: "include",
      cache: "no-store"
    });

    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const msg = (data && typeof data === "object" && data.message) ? data.message : `HTTP ${res.status}`;
      throw new Error(msg);
    }
    return data;
  }

  // ---------- helpers ----------
  const money = (n) =>
    Number(n || 0).toLocaleString("es-MX", { style:"currency", currency:"MXN" });
  const intFmt = (n) =>
    Number(n || 0).toLocaleString("es-MX");

  function renderSummary(s){
    el("kpiTotalSold").textContent = money(s.totalVendido);
    el("kpiTips").textContent = money(s.totalPropina);
    el("kpiUsers").textContent = intFmt(s.usuarios);
    el("kpiTx").textContent = intFmt(s.transacciones);

    el("summaryBody").innerHTML = `
      <tr><th>Total vendido</th><td>${money(s.totalVendido)}</td></tr>
      <tr><th>Total propina</th><td>${money(s.totalPropina)}</td></tr>
      <tr><th>Transacciones</th><td>${intFmt(s.transacciones)}</td></tr>
      <tr><th>Ticket promedio</th><td>${money(s.ticketPromedio)}</td></tr>
      <tr><th>Usuarios</th><td>${intFmt(s.usuarios)}</td></tr>
    `;
  }

  function renderTop(rows){
    const body = el("topProductsBody");
    if (!rows || rows.length === 0){
      body.innerHTML = `<tr><td colspan="4">Sin datos</td></tr>`;
      return;
    }
    body.innerHTML = rows.map((r,i)=>`
      <tr>
        <td>${i+1}</td>
        <td>${r.name}</td>
        <td>${intFmt(r.qty)}</td>
        <td>${money(r.amount)}</td>
      </tr>
    `).join("");
  }

  // ---------- main ----------
  async function load(){
    showErr("");

    const from = el("fromDate").value;
    const to = el("toDate").value;

    el("rangePill").textContent = `${from} → ${to}`;

    const summary = await apiGet(`/api/reports2/summary?from=${from}&to=${to}`);
    renderSummary(summary);

    // Soporta: array directo (v2) O {items:[...]} (v1)
    const topResp = await apiGet(`/api/reports2/top-products?from=${from}&to=${to}&take=10`);
    const topRows = Array.isArray(topResp) ? topResp : (topResp?.items || []);
    renderTop(topRows);
  }

  document.addEventListener("DOMContentLoaded", () => {
    const t = new Date();
    const f = new Date(t); f.setDate(t.getDate()-6);
    el("fromDate").value = f.toISOString().slice(0,10);
    el("toDate").value = t.toISOString().slice(0,10);

    el("btnRefresh").addEventListener("click", () => load().catch(e => showErr(e.message || String(e))));
    el("btnBack").addEventListener("click", ()=>location.href="./index.html");

    load().catch(e => showErr(e.message || String(e)));
  });
})();
