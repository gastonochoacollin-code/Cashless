// wwwroot/reports.js
(() => {
  const API_BASE = window.location.origin;
  const el = (id) => document.getElementById(id);

  const SESSION_KEY = "cashless.session";
  const token =
    localStorage.getItem("token") ||
    localStorage.getItem("authToken") ||
    localStorage.getItem("jwt");

  const sessionRaw = localStorage.getItem(SESSION_KEY);
  let session = null;
  try { session = sessionRaw ? JSON.parse(sessionRaw) : null; } catch { session = null; }

  if (!token && !session?.token) {
    location.href = "/login.html";
    return;
  }

  function showErr(msg){
    const box = el("errBox");
    if(!box) return;
    box.style.display = msg ? "inline-block" : "none";
    box.textContent = msg || "";
  }

  const money = (n) =>
    Number(n || 0).toLocaleString("es-MX", { style:"currency", currency:"MXN" });
  const intFmt = (n) =>
    Number(n || 0).toLocaleString("es-MX");

  async function apiGet(url){
    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${session?.token || token}`,
        "X-Operator-Id": session?.operatorId ? String(session.operatorId) : "",
        "X-Operator-Token": session?.token ? String(session.token) : "",
        ...(session?.tenantId ? { "X-Tenant-Id": String(session.tenantId) } : {})
      },
      credentials: "include",
      cache: "no-store"
    });

    const text = await res.text();
    let data = null;
    try{ data = text ? JSON.parse(text) : null; } catch { data = text; }

    if (!res.ok) {
      const msg = (data && typeof data === "object" && data.message)
        ? data.message
        : `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  async function getWithFallback(paths){
    let lastErr = null;
    let lastPath = null;
    for (const p of paths){
      try{
        lastPath = p;
        return await apiGet(`${API_BASE}${p}`);
      } catch (e){
        lastErr = e;
        if (e.status !== 404) throw e;
      }
    }
    const err = new Error("Endpoint no encontrado");
    err.status = 404;
    err.last = lastErr;
    err.path = lastPath;
    throw err;
  }

  function normalizeSummary(s){
    if (!s || typeof s !== "object") return null;
    if ("totalVendido" in s){
      return {
        totalVendido: s.totalVendido,
        totalPropina: s.totalPropina ?? 0,
        usuarios: s.usuarios ?? s.userCount ?? 0,
        transacciones: s.transacciones ?? s.txCount ?? 0
      };
    }
    return {
      totalVendido: s.totalSold ?? 0,
      totalPropina: s.totalTips ?? 0,
      usuarios: s.userCount ?? 0,
      transacciones: s.txCount ?? 0
    };
  }

  function normalizeTop(resp){
    if (Array.isArray(resp)) return resp;
    return resp?.items || [];
  }

  function renderSummary(s){
    el("kpiTotalSold").textContent = money(s.totalVendido);
    el("kpiTips").textContent = money(s.totalPropina);
    el("kpiUsers").textContent = intFmt(s.usuarios);
    el("kpiTx").textContent = intFmt(s.transacciones);
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

  function renderSalesByArea(rows){
    const body = el("salesByAreaBody");
    if (!body) return;
    if (!rows || rows.length === 0){
      body.innerHTML = `<tr><td colspan="5">Sin datos</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r=>`
      <tr>
        <td>${r.areaName || `Área ${r.areaId ?? ""}`}</td>
        <td>${money(r.totalSold)}</td>
        <td>${money(r.totalTips)}</td>
        <td>${intFmt(r.txCount)}</td>
        <td>${money(r.avgTicket)}</td>
      </tr>
    `).join("");
  }

  async function loadFestivalActive(){
    const target = el("festivalActive");
    if(!target) return;

    try{
      const list = await apiGet(`${API_BASE}/api/festivals`);
      const active = Array.isArray(list)
        ? list.find(x => (x.isActive ?? x.IsActive) === true)
        : null;

      if(active){
        const name = active.name ?? active.Name ?? `Festival ${active.id ?? active.Id}`;
        target.textContent = `Festival: ${name}`;
        return;
      }

      if(Array.isArray(list) && list.length > 0){
        target.textContent = "Festival: (sin activo)";
        return;
      }
    }catch(e){
      if(e.status === 401){
        target.textContent = "Festival: sesión expirada";
        return;
      }
    }

    target.textContent = "Festival: —";
  }

  function setDefaultDates(){
    const t = new Date();
    const f = new Date(t); f.setDate(t.getDate()-6);
    el("fromDate").value = f.toISOString().slice(0,10);
    el("toDate").value = t.toISOString().slice(0,10);
  }

  async function load(){
    showErr("");

    const from = el("fromDate").value;
    const to = el("toDate").value;
    el("rangePill").textContent = `${from} → ${to}`;

    try{
      const summary = await getWithFallback([
        `/api/reports/summary?from=${from}&to=${to}`,
        `/api/reports2/summary?from=${from}&to=${to}`,
        `/api/reports1/summary?from=${from}&to=${to}`
      ]);

      const topResp = await getWithFallback([
        `/api/reports/top-products?from=${from}&to=${to}&take=10`,
        `/api/reports1/top-products?from=${from}&to=${to}&take=10`
      ]);

      const salesByArea = await getWithFallback([
        `/api/reports/sales-by-area?from=${from}&to=${to}`
      ]);

      const norm = normalizeSummary(summary);
      if (!norm) throw new Error("Respuesta inválida de summary");

      renderSummary(norm);
      renderTop(normalizeTop(topResp));
      renderSalesByArea(salesByArea);
    } catch (e){
      if (e.status === 401) {
        showErr("Sesión expirada");
        return;
      }
      if (e.status === 404) {
        const failedPath = e.path || "endpoint desconocido";
        showErr(`404: ${failedPath}`);
        return;
      }
      if (e.status === 500) {
        showErr("Error del servidor. Intenta más tarde.");
        return;
      }
      showErr(e.message || "Error inesperado");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    setDefaultDates();
    loadFestivalActive();
    el("btnApply").addEventListener("click", () => load());
    el("btnReload").addEventListener("click", () => load());
    el("btnBack").addEventListener("click", () => location.href = "./dashboard.html");
    load();
  });
})();
