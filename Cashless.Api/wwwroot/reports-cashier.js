// wwwroot/reports-cashier.js
(() => {
  const el = (id) => document.getElementById(id);
  const FILTER_KEY = "cashless.reports.filters";

  const money = (n) => Number(n || 0).toLocaleString("es-MX", { style:"currency", currency:"MXN" });
  const intFmt = (n) => Number(n || 0).toLocaleString("es-MX");

  function setMsg(text){
    const box = el("msgBox");
    if(!box) return;
    box.textContent = text || "";
  }

  function errLabel(err){
    const status = Number(err?.status || 0);
    const msg = String(err?.message || "Error inesperado");
    return status > 0 ? `ERROR ${status}: ${msg}` : `ERROR: ${msg}`;
  }

  function loadFilters(){
    const raw = sessionStorage.getItem(FILTER_KEY);
    if(!raw) return null;
    try{ return JSON.parse(raw); }catch{ return null; }
  }

  async function loadFestivalInfo(){
    const target = el("festivalInfo");
    if(!target) return;
    try{
      const list = await apiJson("/api/festivals", { method: "GET" });
      const active = Array.isArray(list)
        ? list.find(x => (x.isActive ?? x.IsActive) === true)
        : null;
      if(active){
        const id = active.id ?? active.Id;
        const name = active.name ?? active.Name ?? `Festival ${id}`;
        const start = (active.startDate ?? active.StartDate ?? "").toString().slice(0,10);
        const end = (active.endDate ?? active.EndDate ?? "").toString().slice(0,10);
        target.textContent = `Festival: ${name} (#${id}) ${start} - ${end}`;
        return;
      }
      target.textContent = "Festival: (sin activo)";
    }catch(err){
      target.textContent = "Festival: -";
      setMsg(errLabel(err));
    }
  }

  function renderRows(rows){
    const body = el("cashierBody");
    if(!rows || rows.length === 0){
      body.innerHTML = `<tr><td colspan="4">Sin datos</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r=>`
      <tr>
        <td>${r.operatorName || `Operador ${r.operatorId ?? ""}`}</td>
        <td>${intFmt(r.txCount)}</td>
        <td>${money(r.totalSold)}</td>
        <td>${money(r.totalTips)}</td>
      </tr>
    `).join("");
  }

  function exportCsv(rows){
    const head = ["operator","tx","ventas","propina"];
    const lines = [head.join(",")];
    for(const r of rows){
      lines.push([
        JSON.stringify(r.operatorName || `Operador ${r.operatorId ?? ""}`),
        r.txCount ?? 0,
        r.totalSold ?? 0,
        r.totalTips ?? 0
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reportes_caja.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  window.preparePrint = function(){
    const festivalEl = el("festivalInfo");
    const rangeEl = el("rangePill");
    const pf = el("printFestival");
    const pr = el("printRange");
    const pg = el("printGenerated");
    if(pf) pf.textContent = festivalEl?.textContent || "-";
    if(pr) pr.textContent = rangeEl?.textContent || "-";
    if(pg) pg.textContent = new Date().toLocaleString();
  };

  async function load(){
    setMsg("");
    const f = loadFilters() || {};
    const from = f.from || new Date().toISOString().slice(0,10);
    const to = f.to || new Date().toISOString().slice(0,10);
    const areaId = f.areaId || "";
    const operatorId = f.operatorId || "";

    el("rangePill").textContent = `${from} -> ${to}`;

    const qs = new URLSearchParams({ from, to });
    if(areaId) qs.set("areaId", areaId);
    if(operatorId) qs.set("operatorId", operatorId);

    const rows = await apiJson(`/api/reports/by-cashier?${qs.toString()}`, { method: "GET" });

    renderRows(rows || []);
    el("btnExport").onclick = () => exportCsv(rows || []);

    if((rows || []).length === 0){
      setMsg("Sin datos para el rango/festival actual.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    requireSession();
    if (typeof renderAppMenu === "function") {
      renderAppMenu("appMenu", "/reports-cashier.html");
    }
    loadFestivalInfo();
    el("btnReload").addEventListener("click", () => load());
    load().catch(err => {
      console.error("Reports cashier error:", err);
      renderRows([]);
      setMsg(errLabel(err));
    });
  });
})();
