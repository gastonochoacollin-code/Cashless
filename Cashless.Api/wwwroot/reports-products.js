// wwwroot/reports-products.js
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

  function setErrorBox(text){
    const box = el("errorBox");
    if(!box) return;
    if(!text){
      box.style.display = "none";
      box.textContent = "";
      return;
    }
    box.style.display = "block";
    box.textContent = text;
  }

  function errLabel(err){
    const status = Number(err?.status || 0);
    const msg = String(err?.message || "Error inesperado");
    return status > 0 ? `ERROR ${status}: ${msg}` : `ERROR: ${msg}`;
  }

  function loadFilters(){
    const raw = sessionStorage.getItem(FILTER_KEY);
    if(!raw){
      const t = new Date();
      const f = new Date(t);
      f.setDate(t.getDate() - 6);
      return { from: f.toISOString().slice(0,10), to: t.toISOString().slice(0,10), areaId:"" };
    }
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

  function normalizeRow(r){
    const qty = Number(r?.qtyTotal ?? r?.qty ?? r?.quantity ?? r?.cantidadTotal ?? r?.cantidad ?? 0);
    const total = Number(r?.totalSold ?? r?.totalVendido ?? r?.total ?? r?.totalAmount ?? r?.amount ?? 0);
    const productName = r?.productName ?? r?.product ?? r?.name ?? r?.nombre ?? "-";
    const avgTicket = qty > 0 ? (total / qty) : 0;
    return {
      productId: r?.productId ?? r?.id ?? null,
      productName,
      qtyTotal: qty,
      totalSold: total,
      avgTicket
    };
  }

  function normalizeRows(payload){
    if(Array.isArray(payload)) return payload.map(normalizeRow);
    if(Array.isArray(payload?.items)) return payload.items.map(normalizeRow);
    if(Array.isArray(payload?.rows)) return payload.rows.map(normalizeRow);
    return [];
  }

  function renderRows(rows){
    const body = el("productsBody");
    if(!rows || rows.length === 0){
      body.innerHTML = `<tr><td colspan="4">Sin datos</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.productName || `Producto ${r.productId ?? ""}`}</td>
        <td>${intFmt(r.qtyTotal ?? 0)}</td>
        <td>${money(r.totalSold ?? 0)}</td>
        <td>${money(r.avgTicket ?? 0)}</td>
      </tr>
    `).join("");
  }

  function setStat(id, value){
    const node = el(id);
    if(node) node.textContent = value;
  }

  function computeStats(rows){
    let totalSold = 0;
    let totalUnits = 0;
    for(const r of rows){
      const qty = Number(r.qtyTotal ?? 0);
      const total = Number(r.totalSold ?? 0);
      totalUnits += qty;
      totalSold += total;
    }
    const productsCount = rows.length;
    const avgTicket = totalUnits > 0 ? (totalSold / totalUnits) : 0;
    return { totalSold, totalUnits, productsCount, avgTicket };
  }

  function renderStats(stats){
    setStat("statTotalSold", money(stats.totalSold));
    setStat("statTotalUnits", intFmt(stats.totalUnits));
    setStat("statProducts", intFmt(stats.productsCount));
    setStat("statAvgTicket", money(stats.avgTicket));
  }

  function exportCsv(rows){
    const head = ["producto","cantidad","total_vendido","ticket_promedio"];
    const lines = [head.join(",")];
    for(const r of rows){
      lines.push([
        JSON.stringify(r.productName || `Producto ${r.productId ?? ""}`),
        r.qtyTotal ?? 0,
        r.totalSold ?? 0,
        r.avgTicket ?? 0
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "reportes_productos.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function preparePrint(){
    const festivalText = el("festivalInfo")?.textContent || "Festival: -";
    const rangeText = el("rangePill")?.textContent || "-";
    const pf = el("printFestival");
    const pr = el("printRange");
    const pg = el("printGenerated");
    if(pf) pf.textContent = festivalText;
    if(pr) pr.textContent = `Rango: ${rangeText}`;
    if(pg) pg.textContent = `Generado: ${new Date().toLocaleString()}`;
  }

  function attachPrint(rows){
    const btn = el("btnPrint");
    if(!btn) return;
    btn.onclick = () => {
      if(!rows || rows.length === 0){
        setMsg("Primero carga el reporte.");
        return;
      }
      preparePrint();
      const header = el("printHeader");
      if(header) header.style.display = "block";
      window.print();
      setTimeout(() => {
        if(header) header.style.display = "none";
      }, 300);
    };
  }

  async function load(){
    setMsg("");
    setErrorBox("");
    const f = loadFilters() || {};
    const from = f.from || new Date(Date.now() - (6 * 24 * 60 * 60 * 1000)).toISOString().slice(0,10);
    const to = f.to || new Date().toISOString().slice(0,10);

    el("rangePill").textContent = `${from} -> ${to}`;

    const qs = new URLSearchParams({ from, to });
    if(f.areaId) qs.set("areaId", f.areaId);

    const url = `/api/reports/by-product?${qs.toString()}`;
    console.log("[by-product] url", url);
    try{
      const payload = await apiJson(url, { method: "GET" });
      const list = normalizeRows(payload);
      console.log("[by-product] status", 200);
      console.log("[by-product] firstRowKeys", list?.[0] ? Object.keys(list[0]) : null);
      console.log("[by-product] sampleRow", list?.[0] || null);
      renderRows(list);
      renderStats(computeStats(list));
      el("btnExport").onclick = () => exportCsv(list);
      attachPrint(list);
      if(list.length === 0){
        setMsg("Sin datos para el rango actual.");
      }
    }catch(err){
      console.log("[by-product] status", err?.status || "ERR");
      renderRows([]);
      renderStats({ totalSold: 0, totalUnits: 0, productsCount: 0, avgTicket: 0 });
      setMsg(errLabel(err));
      setErrorBox(errLabel(err));
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    requireSession();
    if (typeof renderAppMenu === "function") {
      renderAppMenu("appMenu", "/reports-products.html");
    }
    await loadFestivalInfo();
    el("btnReload").addEventListener("click", () => load());
    load().catch(err => {
      console.error("Reports products error:", err);
      renderRows([]);
      setMsg(errLabel(err));
      setErrorBox(errLabel(err));
    });
  });
})();
