const session = requireSession();

function $(id){ return document.getElementById(id); }

const allowedRoles = ["Admin","SuperAdmin","JefeOperativo","JefeDeCaja","Cajero"];
const role = String(session?.role || session?.Role || "");
if(!allowedRoles.includes(role)){
  window.location.href = "/ops.html";
  throw new Error("Role not allowed");
}

const state = {
  areas: [],
  areaId: null,
  areaName: "",
  lastReport: null,
  lastReportType: null
};

function money(n){
  const v = Number(n || 0);
  return v.toLocaleString("es-MX", { style:"currency", currency:"MXN" });
}

function fmtInt(n){
  return Number(n || 0).toLocaleString("es-MX");
}

function setSessionInfo(){
  const name = session?.name || session?.operatorName || "Operador";
  $("sessionInfo").textContent = `Sesión: ${name}${role ? " · " + role : ""}`;
}

function setStatus(msg){
  $("statusMsg").textContent = msg || "";
}

function shiftKey(){
  const tenantId = session?.tenantId ?? "0";
  const areaId = state.areaId ?? "0";
  return `cashless.shiftStart.${tenantId}.${areaId}`;
}

function loadShiftStart(){
  const raw = localStorage.getItem(shiftKey());
  return raw ? new Date(raw) : null;
}

function saveShiftStart(dt){
  localStorage.setItem(shiftKey(), dt.toISOString());
}

function clearShiftStart(){
  localStorage.removeItem(shiftKey());
}

function updateShiftInfo(){
  const start = loadShiftStart();
  if(!start){
    $("shiftInfo").textContent = "Turno: cerrado";
  }else{
    $("shiftInfo").textContent = `Turno: abierto desde ${start.toLocaleString()}`;
  }
}

function toLocalInputValue(dt){
  const pad = (n)=> String(n).padStart(2,"0");
  const y = dt.getFullYear();
  const m = pad(dt.getMonth()+1);
  const d = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mm = pad(dt.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function setRange(fromDt, toDt){
  $("fromDt").value = toLocalInputValue(fromDt);
  $("toDt").value = toLocalInputValue(toDt);
  $("rangeInfo").textContent = `${fromDt.toLocaleString()} → ${toDt.toLocaleString()}`;
}

function getRange(){
  const from = new Date($("fromDt").value);
  const to = new Date($("toDt").value);
  return { from, to };
}

function computeRangeToday(){
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
  return { from: start, to: now };
}

function computeRangeLast2h(){
  const now = new Date();
  const start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  return { from: start, to: now };
}

async function loadAreas(){
  const list = await apiJson("/api/areas");
  state.areas = Array.isArray(list) ? list.map(a => ({
    id: a.id ?? a.Id,
    name: a.name ?? a.Name ?? `Área ${a.id ?? a.Id}`
  })) : [];

  const sel = $("areaSelect");
  sel.innerHTML = "";
  for(const a of state.areas){
    const opt = document.createElement("option");
    opt.value = String(a.id);
    opt.textContent = `${a.name} (#${a.id})`;
    sel.appendChild(opt);
  }

  if(state.areas.length){
    state.areaId = state.areas[0].id;
    state.areaName = state.areas[0].name;
    sel.value = String(state.areaId);
  }
}

function normalizeTopProducts(resp){
  if(Array.isArray(resp)) return resp;
  return resp?.items || [];
}

function normalizeSummary(resp){
  const totalSales = resp?.totalSold ?? resp?.totalVendido ?? 0;
  const totalTips = resp?.totalTips ?? resp?.totalPropina ?? 0;
  const txCount = resp?.txCount ?? resp?.transacciones ?? 0;
  const avg = txCount > 0 ? totalSales / txCount : 0;
  return { totalSales, totalTips, txCount, avg, net: totalSales + totalTips };
}

function renderSummary(summary){
  $("kpiTotal").textContent = money(summary.totalSales);
  $("kpiTips").textContent = money(summary.totalTips);
  $("kpiTx").textContent = fmtInt(summary.txCount);
  $("kpiAvg").textContent = money(summary.avg);
  $("kpiNet").textContent = money(summary.net);
}

function renderTopProducts(rows){
  const body = $("topProductsBody");
  if(!rows || rows.length === 0){
    body.innerHTML = `<tr><td colspan="3">Sin datos</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => `
    <tr>
      <td>${r.name ?? r.productName ?? "—"}</td>
      <td>${fmtInt(r.qty ?? 0)}</td>
      <td>${money(r.amount ?? r.total ?? 0)}</td>
    </tr>
  `).join("");
}

function renderTopOperators(rows){
  const body = $("topOperatorsBody");
  if(!rows || rows.length === 0){
    body.innerHTML = `<tr><td colspan="3">Sin datos</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => {
    const name = r.operatorName || (r.operatorId ? `#${r.operatorId}` : "—");
    const total = r.totalSold ?? r.total ?? 0;
    return `
      <tr>
        <td>${name}</td>
        <td>${fmtInt(r.txCount ?? 0)}</td>
        <td>${money(total)}</td>
      </tr>
    `;
  }).join("");
}

function renderRecent(rows){
  const body = $("recentBody");
  if(!rows || rows.length === 0){
    body.innerHTML = `<tr><td colspan="6">Sin datos</td></tr>`;
    return;
  }
  body.innerHTML = rows.map(r => {
    const dt = r.createdAt ? new Date(r.createdAt) : null;
    const when = dt ? dt.toLocaleString() : "—";
    const area = r.areaName || (r.areaId ? `Área ${r.areaId}` : "—");
    const op = r.operatorName || (r.operatorId ? `#${r.operatorId}` : "—");
    return `
      <tr>
        <td>${when}</td>
        <td class="mono">${r.uidMasked ?? "—"}</td>
        <td>${area}</td>
        <td>${op}</td>
        <td>${money(r.total ?? 0)}</td>
        <td>${money(r.tip ?? 0)}</td>
      </tr>
    `;
  }).join("");
}

async function loadReport(){
  setStatus("Cargando reporte...");

  const { from, to } = getRange();
  const fromIso = from.toISOString();
  const toIso = to.toISOString();
  const areaId = state.areaId ? `&areaId=${encodeURIComponent(state.areaId)}` : "";

  const summary = await apiJson(`/api/reports/summary?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${areaId}`);
  const topProducts = await apiJson(`/api/reports/top-products?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${areaId}&take=10`);
  const byOperator = await apiJson(`/api/reports/by-operator?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${areaId}`);
  const recent = await apiJson(`/api/reports/recent?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}${areaId}&take=50`);

  const norm = normalizeSummary(summary);
  renderSummary(norm);
  renderTopProducts(normalizeTopProducts(topProducts));
  renderTopOperators(byOperator);
  renderRecent(recent);

  state.lastReport = {
    range: { from: fromIso, to: toIso },
    summary: norm,
    topProducts: normalizeTopProducts(topProducts),
    topOperators: byOperator,
    recent
  };

  setStatus("Listo.");
}

function openShift(){
  const now = new Date();
  saveShiftStart(now);
  updateShiftInfo();
  setStatus("Turno abierto.");
}

async function closeShift(){
  const start = loadShiftStart();
  if(!start){
    setStatus("No hay turno abierto.");
    return;
  }
  const now = new Date();
  setRange(start, now);
  await loadReport();
  clearShiftStart();
  updateShiftInfo();
  state.lastReportType = "shift";
  setStatus("Turno cerrado.");
}

async function finalCut(){
  const range = computeRangeToday();
  setRange(range.from, range.to);
  await loadReport();
  state.lastReportType = "final";
  setStatus("Corte final listo.");
}

function buildPrintPayload(type){
  if(!state.lastReport){
    setStatus("Primero genera un reporte.");
    return;
  }
  const meta = {
    tenantId: session?.tenantId ?? null,
    areaId: state.areaId,
    areaName: state.areaName,
    rango: state.lastReport.range,
    generadoPor: session?.name || session?.operatorName || "Operador",
    fecha: new Date().toISOString(),
    tipo: type
  };

  const payload = {
    meta,
    resumen: state.lastReport.summary,
    topProductos: state.lastReport.topProducts,
    topOperadores: state.lastReport.topOperators,
    transaccionesRecientes: state.lastReport.recent
  };

  sessionStorage.setItem("cashless.printPayload", JSON.stringify(payload));
  window.open(`/print-report.html?type=${encodeURIComponent(type)}`, "_blank");
}

async function init(){
  setSessionInfo();
  await loadAreas();
  updateShiftInfo();

  const range = computeRangeToday();
  setRange(range.from, range.to);

  $("areaSelect").addEventListener("change", async (e)=>{
    const id = Number(e.target.value);
    const area = state.areas.find(x => x.id === id);
    state.areaId = id;
    state.areaName = area?.name || "";
    updateShiftInfo();
    await loadReport();
  });

  $("btnToday").addEventListener("click", async ()=>{
    const r = computeRangeToday();
    setRange(r.from, r.to);
    await loadReport();
  });
  $("btnLast2h").addEventListener("click", async ()=>{
    const r = computeRangeLast2h();
    setRange(r.from, r.to);
    await loadReport();
  });
  $("btnApply").addEventListener("click", async ()=> loadReport());
  $("btnRefresh").addEventListener("click", async ()=> loadReport());

  $("btnOpenShift").addEventListener("click", openShift);
  $("btnCloseShift").addEventListener("click", closeShift);
  $("btnFinal").addEventListener("click", finalCut);
  $("btnPrintShift").addEventListener("click", ()=> buildPrintPayload("shift"));
  $("btnPrintFinal").addEventListener("click", ()=> buildPrintPayload("final"));

  $("btnBack").addEventListener("click", ()=> window.location.href = "/ops.html");
  $("btnLogout").addEventListener("click", ()=>{
    clearSession();
    window.location.href = "/login.html";
  });

  await loadReport();
}

init().catch(e=>{
  console.error("cashier init error:", e);
  setStatus("Error inicializando caja.");
});
