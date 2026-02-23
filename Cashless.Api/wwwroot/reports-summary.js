// wwwroot/reports-summary.js
(() => {
  const el = (id) => document.getElementById(id);
  const FILTER_KEY = "cashless.reports.filters";
  const role = String(getSession()?.role || getSession()?.Role || "").trim().toLowerCase();
  const isCashier = role === "cajero" || role === "cashier";

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

  function renderSummary(s){
    el("kpiTotalSold").textContent = money(s.totalVendido);
    el("kpiTips").textContent = money(s.totalPropina);
    el("kpiUsers").textContent = intFmt(s.usuarios);
    el("kpiTx").textContent = intFmt(s.transacciones);
  }

  function configureCashierUi(){
    el("kpiLabel1").textContent = "Total recargado";
    el("kpiLabel2").textContent = "Total recargas";
    el("kpiLabel3").textContent = "Efectivo";
    el("kpiLabel4").textContent = "Turno actual";
    el("sectionTitle").textContent = "Desglose por metodo";
    el("sectionDesc").textContent = "Recargas del cajero en el rango.";
    el("th1").textContent = "Metodo";
    el("th2").textContent = "Monto";
    el("th3").textContent = "Detalle";
    el("th4").textContent = "-";
    el("th5").textContent = "-";
  }

  function renderSalesByArea(rows){
    const body = el("salesByAreaBody");
    if (!rows || rows.length === 0){
      body.innerHTML = `<tr><td colspan="5">Sin datos</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r=>`
      <tr>
        <td>${r.areaName || `Area ${r.areaId ?? ""}`}</td>
        <td>${money(r.totalSold)}</td>
        <td>${money(r.totalTips)}</td>
        <td>${intFmt(r.txCount)}</td>
        <td>${money(r.avgTicket)}</td>
      </tr>
    `).join("");
  }

  function renderCashierSummary(data){
    const totalRecargado = Number(data?.totalRecargado || 0);
    const totalRecargas = Number(data?.totalRecargas || 0);
    const breakdown = data?.breakdown || {};
    const currentShift = data?.currentShift || null;

    el("kpiTotalSold").textContent = money(totalRecargado);
    el("kpiTips").textContent = intFmt(totalRecargas);
    el("kpiUsers").textContent = money(breakdown.efectivo || 0);
    el("kpiTx").textContent = currentShift?.shiftId ? `#${currentShift.shiftId}` : "Sin turno";

    const rows = [
      { method: "EFECTIVO", amount: Number(breakdown.efectivo || 0), detail: `${intFmt(totalRecargas)} recargas` },
      { method: "TARJETA", amount: Number(breakdown.tarjeta || 0), detail: "-" },
      { method: "CRIPTO", amount: Number(breakdown.cripto || 0), detail: "-" },
      { method: "TRANSFERENCIA", amount: Number(breakdown.transferencia || 0), detail: "-" },
      { method: "OTRO", amount: Number(breakdown.otro || 0), detail: "-" }
    ];

    const body = el("salesByAreaBody");
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.method}</td>
        <td>${money(r.amount)}</td>
        <td>${r.detail}</td>
        <td>-</td>
        <td>-</td>
      </tr>
    `).join("");

    el("btnExport").onclick = () => {
      const head = ["metodo","monto","detalle"];
      const lines = [head.join(",")];
      rows.forEach(r => lines.push([r.method, r.amount, JSON.stringify(r.detail)].join(",")));
      const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "resumen_recargas_cajero.csv";
      a.click();
      URL.revokeObjectURL(url);
    };
  }

  function exportCsv(rows){
    const head = ["area","ventas","propina","tx","ticket_promedio"];
    const lines = [head.join(",")];
    for(const r of rows){
      lines.push([
        JSON.stringify(r.areaName || `Area ${r.areaId ?? ""}`),
        r.totalSold ?? 0,
        r.totalTips ?? 0,
        r.txCount ?? 0,
        r.avgTicket ?? 0
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reportes_resumen.csv";
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

    el("rangePill").textContent = `${from} -> ${to}`;

    const qs = new URLSearchParams({ from, to });
    if(areaId) qs.set("areaId", areaId);

    if(isCashier){
      configureCashierUi();
      const summary = await apiJson(`/api/reports/cashier/summary?${new URLSearchParams({ from, to }).toString()}`, { method: "GET" });
      renderCashierSummary(summary || {});
      return;
    }

    const summary = await apiJson(`/api/reports/summary?${qs.toString()}`, { method: "GET" });
    const byArea = await apiJson(`/api/reports/sales-by-area?${new URLSearchParams({ from, to }).toString()}`, { method: "GET" });

    const norm = normalizeSummary(summary);
    renderSummary(norm || { totalVendido: 0, totalPropina: 0, usuarios: 0, transacciones: 0 });
    renderSalesByArea(byArea || []);
    el("btnExport").onclick = () => exportCsv(byArea || []);

    if((byArea || []).length === 0){
      setMsg("Sin datos para el rango/festival actual.");
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    requireSession();
    if (typeof renderAppMenu === "function") {
      renderAppMenu("appMenu", "/reports-summary.html");
    }
    loadFestivalInfo();
    el("btnReload").addEventListener("click", () => load());
    load().catch(err => {
      console.error("Reports summary error:", err);
      renderSummary({ totalVendido: 0, totalPropina: 0, usuarios: 0, transacciones: 0 });
      renderSalesByArea([]);
      const status = Number(err?.status || 0);
      if(status === 403){
        setMsg("ERROR 403: Sin permiso para este reporte. Usa Resumen de recargas.");
      }else{
        setMsg(errLabel(err));
      }
    });
  });
})();
