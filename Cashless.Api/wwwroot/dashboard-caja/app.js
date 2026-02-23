(() => {
  const session = requireSession();
  const $ = (id) => document.getElementById(id);
  const role = String(session?.role || session?.Role || "").trim().toLowerCase();
  const isCashier = role === "cajero" || role === "cashier";
  const TERMINAL_KEY = "cashless.terminalId";
  let topupBusy = false;

  function money(n){
    return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  }
  function setStatus(msg, err = false){
    const el = $("status");
    if(!el) return;
    el.textContent = msg || "";
    el.style.color = err ? "#ffd1d1" : "";
    el.style.borderColor = err ? "rgba(255,90,90,.45)" : "";
  }
  function apiErr(e){
    const s = Number(e?.status || 0);
    const m = String(e?.message || "Error inesperado");
    const u = String(e?.url || `${API_BASE}${window.location.pathname}`);
    return `ERROR ${s > 0 ? s : 0}: ${m} (URL: ${u})`;
  }

  function loadTerminalId(){
    return (sessionStorage.getItem(TERMINAL_KEY) || "").trim() || "BARRA-01";
  }

  function saveTerminalId(v){
    const clean = String(v || "").trim() || "BARRA-01";
    sessionStorage.setItem(TERMINAL_KEY, clean);
    if($("terminalLabel")) $("terminalLabel").textContent = clean;
    if($("terminalSelect")) $("terminalSelect").value = clean;
    return clean;
  }

  function setUidInputs(uid){
    const clean = normalizeUid(uid || "");
    if($("topupUid")) $("topupUid").value = clean;
    if($("cardUid")) $("cardUid").value = clean;
    return clean;
  }

  async function getCardByUid(uid){
    const clean = normalizeUid(uid);
    if(!clean) throw new Error("UID requerido");
    try{
      return await apiJson(`/api/cards/${encodeURIComponent(clean)}`, { method: "GET" });
    }catch(e){
      if(Number(e?.status || 0) !== 404) throw e;
      return await apiJson(`/cards/${encodeURIComponent(clean)}`, { method: "GET" });
    }
  }

  async function readCard(){
    try{
      const rawTid = String($("terminalSelect")?.value || "").trim();
      const tid = rawTid ? saveTerminalId(rawTid) : getTerminalId();
      const uid = await apiGetLastUid(tid);
      if(!uid){
        if($("cardLookupResult")) $("cardLookupResult").textContent = "Sin UID leido en el lector.";
        setStatus("Sin UID leido", true);
        return;
      }
      const clean = setUidInputs(uid);
      if($("cardLookupResult")) $("cardLookupResult").textContent = `UID leido: ${clean}`;
      setStatus("UID capturado");
    }catch(e){
      if($("cardLookupResult")) $("cardLookupResult").textContent = apiErr(e);
      setStatus(apiErr(e), true);
    }
  }

  async function lookupCard(){
    const uid = normalizeUid(($("topupUid")?.value || $("cardUid")?.value || "").trim());
    if(!uid){
      setStatus("Captura UID para buscar tarjeta", true);
      return;
    }
    try{
      const card = await getCardByUid(uid);
      if($("cardLookupResult")) $("cardLookupResult").textContent = `OK - ${card.userName || "-"} (saldo: ${money(card.balance || 0)})`;
      setStatus("Tarjeta encontrada");
    }catch(e){
      if(Number(e?.status || 0) === 404){
        if($("cardLookupResult")) $("cardLookupResult").textContent = "Tarjeta no asignada";
        setStatus("Tarjeta no asignada", true);
        return;
      }
      if($("cardLookupResult")) $("cardLookupResult").textContent = apiErr(e);
      setStatus(apiErr(e), true);
    }
  }

  function renderClients(rows){
    const body = $("clientsRows");
    if(!Array.isArray(rows) || rows.length === 0){
      body.innerHTML = `<tr><td colspan="3" class="muted">Sin clientes</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(x => `
      <tr>
        <td>${x.id ?? "-"}</td>
        <td>${x.name ?? "-"}</td>
        <td>${money(x.balance ?? 0)}</td>
      </tr>
    `).join("");
  }

  async function loadShift(){
    try{
      const cur = await apiJson("/api/shifts/current", { method: "GET" });
      $("kShift").textContent = cur.hasOpenShift ? `#${cur.shiftId}` : "Sin turno";
      $("kBox").textContent = cur.boxId ?? "-";
      $("kConvTurno").textContent = money(cur.totalConvertedCurrentShift || 0);
      $("kConvHist").textContent = money(cur.totalConvertedHistorical || 0);
      $("kTxTurno").textContent = String(cur.totalTransactionsCurrentShift || 0);
      $("kCash").textContent = money(cur.totalCashCurrentShift || 0);
      $("kCard").textContent = money(cur.totalCardCurrentShift || 0);
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  async function loadClients(){
    try{
      const rows = await apiJson("/api/clients", { method: "GET" });
      renderClients(rows);
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  async function searchClients(){
    const q = ($("qClients").value || "").trim();
    try{
      const rows = await apiJson(`/api/clients/search?q=${encodeURIComponent(q)}`, { method: "GET" });
      renderClients(rows);
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  async function createClient(){
    const payload = {
      name: ($("newClientName").value || "").trim(),
      email: ($("newClientEmail").value || "").trim() || null,
      phone: ($("newClientPhone").value || "").trim() || null
    };
    if(!payload.name){
      setStatus("Captura el nombre del cliente", true);
      return;
    }
    try{
      const row = await apiJson("/api/clients", { method: "POST", body: JSON.stringify(payload) });
      setStatus(`Cliente creado: #${row.id} ${row.name}`);
      $("newClientName").value = "";
      $("newClientEmail").value = "";
      $("newClientPhone").value = "";
      await loadClients();
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  async function assignCard(force = false){
    const userId = Number($("cardUserId").value || 0);
    const uid = String($("cardUid").value || "").trim();
    if(userId <= 0 || !uid){
      setStatus("Captura ClientId y UID", true);
      return;
    }
    const path = force ? "/api/cards/reassign" : "/api/cards/assign";
    const payload = force ? { userId, uid, reason: ($("reassignReason").value || "").trim() } : { userId, uid };
    if(force && !payload.reason){
      setStatus("Motivo obligatorio para reasignar", true);
      return;
    }
    try{
      const r = await apiJson(path, { method: "POST", body: JSON.stringify(payload) });
      $("cardResult").textContent = `OK - uid ${r.uid || uid} para user #${r.userId || userId}`;
      setStatus("Tarjeta actualizada");
    }catch(e){
      $("cardResult").textContent = apiErr(e);
      setStatus(apiErr(e), true);
    }
  }

  async function doTopup(){
    if(topupBusy) return;
    const uid = normalizeUid(String($("topupUid").value || "").trim());
    const amount = Number($("topupAmount").value || 0);
    const paymentMethod = String($("topupPay").value || "cash");
    if(!uid || amount <= 0){
      setStatus("Captura UID y monto valido", true);
      return;
    }
    topupBusy = true;
    const btn = $("btnTopup");
    const prevText = btn?.textContent || "Recargar";
    if(btn){
      btn.disabled = true;
      btn.textContent = "Procesando...";
    }
    try{
      const r = await apiJson("/api/topups", {
        method: "POST",
        body: JSON.stringify({ uid, cardUid: uid, amount, paymentMethod })
      });
      $("topupResult").textContent = `OK - ${r.clientName} ${money(r.beforeBalance)} -> ${money(r.afterBalance)}`;
      setStatus("Recarga registrada");
      await loadShift();
      await loadClients();
    }catch(e){
      const label = apiErr(e);
      $("topupResult").textContent = label;
      setStatus(label, true);
      if(Number(e?.status || 0) === 409){
        alert(e?.message || "Recarga duplicada detectada.");
      }
    }finally{
      topupBusy = false;
      if(btn){
        btn.disabled = false;
        btn.textContent = prevText;
      }
    }
  }

  async function openShift(){
    try{
      const r = await apiJson("/api/shifts/open", { method: "POST", body: JSON.stringify({}) });
      setStatus(`Turno abierto #${r.shiftId}`);
      await loadShift();
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  async function closeShift(){
    try{
      const r = await apiJson("/api/shifts/close", { method: "POST" });
      setStatus(`Turno cerrado #${r.shiftId}`);
      await loadShift();
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  async function loadCloseout(){
    try{
      const data = await apiJson("/api/shifts/mine/closeout", { method: "GET" });
      $("closeout").textContent = JSON.stringify(data, null, 2);
      setStatus("Corte generado");
    }catch(e){
      setStatus(apiErr(e), true);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    renderCashierMenu("cashierMenu", "/dashboard-caja/");
    if(!isCashier){
      $("unauth").style.display = "block";
      return;
    }
    $("main").style.display = "block";
    $("sessionInfo").textContent = `${session?.name || "Cajero"} - caja ${session?.area || session?.areaId || "-"} - tenant ${session?.tenantId ?? "-"}`;
    saveTerminalId(loadTerminalId());
    $("terminalSelect")?.addEventListener("change", () => saveTerminalId($("terminalSelect").value));

    $("btnOpenShift").addEventListener("click", openShift);
    $("btnCloseShift").addEventListener("click", closeShift);
    $("btnTopup").addEventListener("click", doTopup);
    $("btnSearchClients").addEventListener("click", searchClients);
    $("btnNewClient").addEventListener("click", createClient);
    $("btnAssignCard").addEventListener("click", () => assignCard(false));
    $("btnReassignCard").addEventListener("click", () => assignCard(true));
    $("btnCloseout").addEventListener("click", loadCloseout);
    $("btnReadCard")?.addEventListener("click", readCard);
    $("btnLookupCard")?.addEventListener("click", lookupCard);

    await loadShift();
    await loadClients();
  });
})();

