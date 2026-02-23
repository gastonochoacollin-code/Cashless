(() => {
  const $ = (id) => document.getElementById(id);
  const session = requireSession();
  const role = String(session?.role || session?.Role || "").trim().toLowerCase();
  const isCashier = role === "cajero" || role === "cashier";
  const isJefeOperativo = role === "jefeoperativo";
  const isAdmin = role === "admin" || role === "superadmin";
  const isOps = isCashier || isJefeOperativo || isAdmin;
  let selectedShiftId = null;
  let lastCloseoutData = null;
  let lastCloseoutRows = [];
  let lastCloseoutSummary = null;

  function money(n){
    return Number(n || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
  }

  function fmtDate(v){
    if(!v) return "-";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString("es-MX");
  }

  function setStatus(msg, isError = false){
    const el = $("status");
    if(!el) return;
    el.textContent = msg || "";
    el.style.color = isError ? "#ffd1d1" : "";
    el.style.borderColor = isError ? "rgba(255,90,90,.45)" : "";
  }

  function errLabel(e){
    const status = Number(e?.status || 0);
    const msg = String(e?.message || "Error inesperado");
    const url = String(e?.url || `${API_BASE}${window.location.pathname}`);
    return `ERROR ${status || 0}: ${msg} (URL: ${url})`;
  }

  function defaultRange(){
    const t = new Date();
    const f = new Date(t);
    f.setDate(t.getDate() - 30);
    return { from: f.toISOString().slice(0, 10), to: t.toISOString().slice(0, 10) };
  }

  function renderSummary(data){
    const b = data?.breakdown || {};
    $("kCount").textContent = String(data?.totalRecargas || 0);
    $("kTotal").textContent = money(data?.totalRecargado || 0);
    $("kCash").textContent = money(b.efectivo || 0);
    $("kCard").textContent = money(b.tarjeta || 0);
    $("kCrypto").textContent = money(b.cripto || 0);
    $("kTransfer").textContent = money(b.transferencia || 0);
    $("kOther").textContent = money(b.otro || 0);
    $("kShift").textContent = data?.currentShift?.shiftId ? `#${data.currentShift.shiftId}` : "Sin turno";
  }

  function renderShifts(items){
    const body = $("rows");
    if(!Array.isArray(items) || items.length === 0){
      body.innerHTML = `<tr><td colspan="9" class="muted">Sin turnos en el rango</td></tr>`;
      return;
    }

    body.innerHTML = items.map(x => `
      <tr>
        <td>#${x.shiftId}</td>
        <td>${x.cashierName || "-"} <span class="muted">(${x.cashierId ?? "-"})</span></td>
        <td>${fmtDate(x.openedAt)}</td>
        <td>${fmtDate(x.closedAt)}</td>
        <td>${x.status || "-"}</td>
        <td>${x.totalRecargas || 0}</td>
        <td>${money(x.totalRecargado || 0)}</td>
        <td>${fmtDate(x.lastRechargeAt)}</td>
        <td>
          <div class="row" style="gap:6px">
            <button class="btn alt" data-view="${x.shiftId}">Ver corte</button>
            <button class="btn alt" data-print="${x.shiftId}">Imprimir PDF</button>
          </div>
        </td>
      </tr>
    `).join("");

    body.querySelectorAll("button[data-view]").forEach(btn => {
      btn.addEventListener("click", () => {
        loadCloseout(Number(btn.getAttribute("data-view")));
      });
    });
    body.querySelectorAll("button[data-print]").forEach(btn => {
      btn.addEventListener("click", () => {
        printCloseout(Number(btn.getAttribute("data-print")));
      });
    });
  }

  function renderCloseout(data, fallbackLast = null){
    const d = data || {};
    const b = d?.desglosePorMetodo || {};
    const total = d?.totalRecargado || 0;
    const totalRec = d?.totalRecargas || 0;
    const expected = d?.totalEfectivoEsperado || b?.totalEfectivo || 0;
    const diff = d?.diferenciaContraEfectivoFisico || 0;
    const cashierName = d?.cashier || "-";
    const cashierId = d?.cashierId ?? "-";
    $("cutCashier").textContent = `${cashierName} (Id: ${cashierId})`;
    $("cutShift").textContent = d?.shiftId ? `#${d.shiftId}` : (selectedShiftId ? `#${selectedShiftId}` : "-");
    $("cutCount").textContent = String(totalRec || 0);
    $("cutTotal").textContent = money(total);
    $("cutExpected").textContent = money(expected);
    $("cutDiff").textContent = money(diff);
    $("cutLast").textContent = fmtDate(fallbackLast);

    // cache for print
    lastCloseoutData = data || null;
    lastCloseoutSummary = data || null;
    lastCloseoutRows = Array.isArray(d?.rows) ? d.rows : Array.isArray(d?.Rows) ? d.Rows : [];
    renderPrintRows(lastCloseoutRows);
  }

  function renderPrintRows(rows){
    const body = $("printRows");
    if(!body) return;
    if(!Array.isArray(rows) || rows.length === 0){
      body.innerHTML = `<tr><td colspan="6" class="muted">Sin datos</td></tr>`;
      return;
    }
    body.innerHTML = rows.map(r => `
      <tr>
        <td>${r.CreatedAt || r.createdAt || ""}</td>
        <td>${r.CardUid || r.cardUid || ""}</td>
        <td>${money(r.Amount || r.amount || 0)}</td>
        <td>${r.PaymentMethod || r.paymentMethod || ""}</td>
        <td>${r.PaymentDetail || r.paymentDetail || ""}</td>
        <td>${r.Comment || r.comment || ""}</td>
      </tr>
    `).join("");
  }

  function setCloseoutMessage(msg){
    const el = $("closeout");
    if(!el) return;
    el.textContent = msg || "";
  }

  async function fetchCloseoutSummary(shiftId){
    const phys = Number($("physicalCash")?.value || "");
    const qs = Number.isFinite(phys) && phys >= 0
      ? `?physicalCash=${encodeURIComponent(phys)}`
      : "?physicalCash=0";

    const url = `/api/recharges/reports/shift/${shiftId}${qs}`;
    const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }

    if(!res.ok){
      throw Object.assign(new Error(data?.message || `HTTP ${res.status}`), {
        status: res.status,
        url: `${API_BASE}${url}`
      });
    }
    return data;
  }

  async function fetchCloseoutRows(shiftId){
    const phys = Number($("physicalCash")?.value || "");
    const qs = Number.isFinite(phys) && phys >= 0
      ? `?physicalCash=${encodeURIComponent(phys)}`
      : "?physicalCash=0";
    const url = `/api/recharges/reports/shift/${shiftId}/pdf-model${qs}`;
    const res = await fetch(url, { headers: apiHeaders(), cache: "no-store" });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if(!res.ok){
      throw Object.assign(new Error(data?.message || `HTTP ${res.status}`), {
        status: res.status,
        url: `${API_BASE}${url}`
      });
    }
    return data;
  }

  async function loadCloseout(shiftId){
    if(!shiftId) return;
    selectedShiftId = Number(shiftId);
    setCloseoutMessage("Cargando corte...");
    try{
      const data = await fetchCloseoutSummary(selectedShiftId);

      // normalize rows for print (if any)
      if(data && !data.rows && data.Rows) data.rows = data.Rows;
      renderCloseout(data);
      setCloseoutMessage(`Corte cargado: turno #${data?.shiftId ?? selectedShiftId} - Cajero: ${data?.cashier || "-"} (Id: ${data?.cashierId ?? "-"})`);
      setStatus(`Corte cargado del turno #${selectedShiftId}`);
    }
    catch(e){
      setCloseoutMessage(`${e?.message || "Error al cargar corte"} (HTTP ${e?.status || "?"})`);
      setStatus(errLabel(e), true);
      console.error("Closeout error:", e);
    }
  }

  async function printCloseout(shiftId){
    if(!shiftId) return;
    try{
      const summary = await fetchCloseoutSummary(shiftId);
      // asegurar panel coherente
      renderCloseout(summary);
      const pdfModel = await fetchCloseoutRows(shiftId);
      const rows = Array.isArray(pdfModel?.Rows) ? pdfModel.Rows : [];

      console.log("[print] summary:", summary);
      console.log("[print] detailRows:", rows.length);
      console.log("[print] data source keys:", Object.keys(summary || {}));

      const total = Number(summary?.totalRecargado || 0);
      const count = Number(summary?.totalRecargas || 0);
      if(total <= 0 && count <= 0){
        setStatus("No hay datos para imprimir.", true);
        return;
      }

      const fest = getFestivalId() || "-";
      $("printMeta").textContent = `Cajero: ${summary?.cashier || "-"} (Id: ${summary?.cashierId || "-"}) · Turno: ${summary?.shiftId || shiftId} · Festival: ${fest} · ${new Date().toLocaleString()}`;
      renderPrintRows(rows);

      document.body.classList.add("printing");
      const after = () => {
        document.body.classList.remove("printing");
        window.removeEventListener("afterprint", after);
      };
      window.addEventListener("afterprint", after);
      window.print();
    }catch(e){
      setStatus(errLabel(e), true);
    }
  }

  async function loadAll(){
    const from = $("fromDate").value;
    const to = $("toDate").value;
    const qs = new URLSearchParams({ from, to }).toString();

    try{
      const summary = await apiJson(`/api/reports/cashier/summary?${qs}`, { method: "GET" });
      renderSummary(summary || {});
    }catch(e){
      setStatus(errLabel(e), true);
      return;
    }

    try{
      const shifts = await apiJson(`/api/cashier/shifts?${qs}`, { method: "GET" });
      const items = shifts?.items || [];
      renderShifts(items);
      if(items.length > 0){
        selectedShiftId = Number(items[0].shiftId);
        renderCloseout(null, items[0].lastRechargeAt);
        await loadCloseout(selectedShiftId);
      }
      setStatus("Reportes cargados");
    }catch(e){
      setStatus(errLabel(e), true);
    }
  }

  document.addEventListener("DOMContentLoaded", async () => {
    try{
      renderCashierMenu("cashierMenu", "/dashboard-caja/reportes.html");
      if(!isOps){
        $("unauth").style.display = "block";
        setStatus("No autorizado", true);
        return;
      }

      $("main").style.display = "block";
      $("sessionInfo").textContent = `${session?.name || "Operador"} - ${session?.role || "-"} - tenant ${session?.tenantId ?? "-"}`;
      const r = defaultRange();
      $("fromDate").value = r.from;
      $("toDate").value = r.to;

      $("btnReload").addEventListener("click", loadAll);
      $("btnRecalc").addEventListener("click", () => loadCloseout(selectedShiftId));

      await loadAll();
    }catch(e){
      setStatus(errLabel(e), true);
    }
  });
})();
