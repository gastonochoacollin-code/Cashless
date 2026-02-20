const session = requireSession();

function $(id){ return document.getElementById(id); }

// ===================== Terminal (multi-caja) =====================
function getQueryParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

function loadTerminalId(){
  const fromQuery = (getQueryParam("terminalId") || "").trim();
  if(fromQuery) return fromQuery;

  const stored = (localStorage.getItem("terminalId") || "").trim();
  if(stored) return stored;

  return "BARRA-01";
}

function setTerminalId(newId){
  const clean = (newId || "").trim() || "BARRA-01";
  localStorage.setItem("terminalId", clean);
  state.terminalId = clean;

  const input = $("terminalIdInput");
  const label = $("terminalIdLabel");
  if(input) input.value = clean;
  if(label) label.textContent = clean;
}

const state = {
  areas: [],
  areaId: null,
  menuId: null,
  products: [],
  cart: new Map(),
  lastUid: "",
  lastUidTimer: null,
  terminalId: ""
};

function setSessionInfo(){
  const name = session?.name || session?.operatorName || "Operador";
  const role = session?.role || session?.Role || "";
  $("sessionInfo").textContent = `Sesión: ${name}${role ? " · " + role : ""}`;
}

function money(n){
  const v = Number(n || 0);
  return "$" + v.toFixed(2);
}

function normalizeProduct(item){
  return {
    id: item.productId ?? item.id ?? item.product?.id,
    name: item.productName ?? item.name ?? item.product?.name ?? "Producto",
    price: Number(item.price ?? item.priceOverride ?? item.product?.price ?? item.unitPrice ?? 0),
    category: item.category ?? item.product?.category ?? ""
  };
}

function renderAreas(){
  const sel = $("areaSelect");
  sel.innerHTML = "";
  for(const a of state.areas){
    const opt = document.createElement("option");
    opt.value = String(a.id);
    opt.textContent = `${a.name} (#${a.id})`;
    sel.appendChild(opt);
  }
  if(state.areaId){
    sel.value = String(state.areaId);
  }else if(state.areas.length){
    state.areaId = state.areas[0].id;
    sel.value = String(state.areaId);
  }
}

function renderProducts(){
  const q = ($("q").value || "").trim().toLowerCase();
  const grid = $("productsGrid");
  grid.innerHTML = "";

  const list = state.products.filter(p => {
    if(!q) return true;
    return String(p.name || "").toLowerCase().includes(q)
      || String(p.category || "").toLowerCase().includes(q);
  });

  $("catalogMeta").textContent = `${list.length} productos`;

  for(const p of list){
    const card = document.createElement("div");
    card.className = "product";
    card.innerHTML = `
      <div>
        <b>${p.name}</b><br/>
        <small>${p.category || "—"}</small>
      </div>
      <div style="text-align:right">
        <div class="mono">${money(p.price)}</div>
        <button class="btn alt" data-id="${p.id}" style="margin-top:6px">Agregar</button>
      </div>
    `;
    grid.appendChild(card);
  }

  grid.querySelectorAll("button[data-id]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = Number(btn.dataset.id);
      addToCart(id);
    });
  });
}

function addToCart(productId){
  const p = state.products.find(x => Number(x.id) === Number(productId));
  if(!p) return;
  const existing = state.cart.get(p.id);
  if(existing){
    existing.qty += 1;
  }else{
    state.cart.set(p.id, { id: p.id, name: p.name, price: p.price, qty: 1 });
  }
  renderCart();
}

function renderCart(){
  const rows = $("cartRows");
  rows.innerHTML = "";

  const items = Array.from(state.cart.values());
  if(items.length === 0){
    $("cartMsg").textContent = "Sin productos";
  }else{
    $("cartMsg").textContent = `${items.length} producto(s)`;
  }

  for(const it of items){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${it.name}</td>
      <td class="mono">${money(it.price)}</td>
      <td>
        <div class="qty">
          <button class="btn alt" data-act="dec" data-id="${it.id}">-</button>
          <span class="mono">${it.qty}</span>
          <button class="btn alt" data-act="inc" data-id="${it.id}">+</button>
        </div>
      </td>
      <td class="mono">${money(it.price * it.qty)}</td>
      <td><button class="btn danger" data-act="del" data-id="${it.id}">X</button></td>
    `;
    rows.appendChild(tr);
  }

  rows.querySelectorAll("button[data-act]").forEach(btn=>{
    btn.addEventListener("click", ()=>{
      const id = Number(btn.dataset.id);
      const act = btn.dataset.act;
      const it = state.cart.get(id);
      if(!it) return;
      if(act === "inc") it.qty += 1;
      if(act === "dec") it.qty = Math.max(1, it.qty - 1);
      if(act === "del") state.cart.delete(id);
      renderCart();
    });
  });

  renderTotals();
}

function getTotals(){
  const items = Array.from(state.cart.values());
  const subtotal = items.reduce((acc, it)=> acc + (it.price * it.qty), 0);

  const manual = Number($("tipManual").value || 0);
  const percent = Number($("tipPercent").value || 0);
  const tip = manual > 0 ? manual : (subtotal * (percent / 100));

  return {
    subtotal,
    tip,
    total: subtotal + tip
  };
}

function renderTotals(){
  const t = getTotals();
  $("subtotal").textContent = money(t.subtotal);
  $("tip").textContent = money(t.tip);
  $("total").textContent = money(t.total);
}

function setPayMsg(text, kind){
  const el = $("payMsg");
  el.className = kind ? (kind === "ok" ? "success" : "error") : "muted";
  el.textContent = text || "";
}

async function loadAreas(){
  const list = await apiJson("/api/areas");
  state.areas = Array.isArray(list) ? list.map(a => ({
    id: a.id ?? a.Id,
    name: a.name ?? a.Name ?? `Area ${a.id ?? a.Id}`
  })) : [];
  renderAreas();
}

async function loadProductsForArea(areaId){
  state.menuId = null;
  state.products = [];

  // Intento 1: /api/menus?areaId= (si no existe, ajustar aquí)
  let menu = null;
  try{
    const res = await apiFetch(`/api/menus?areaId=${encodeURIComponent(areaId)}`, { method:"GET" });
    if(res.ok){
      const data = await res.json();
      if(Array.isArray(data)) menu = data[0];
      else menu = data;
    }
  }catch{
    // Ignorar y hacer fallback
  }

  if(menu && (menu.id ?? menu.Id)){
    const menuId = menu.id ?? menu.Id;
    try{
      const res = await apiFetch(`/api/menus/${menuId}/items`, { method:"GET" });
      if(res.ok){
        const items = await res.json();
        state.menuId = menuId;
        state.products = Array.isArray(items) ? items.map(normalizeProduct) : [];
        renderProducts();
        return;
      }
    }catch{
      // Ignorar y hacer fallback
    }
  }

  // Fallback: /api/areas/{areaId}/products
  const list = await apiJson(`/api/areas/${areaId}/products`);
  state.products = Array.isArray(list) ? list.map(item => ({
    id: item.productId ?? item.ProductId ?? item.id,
    name: item.productName ?? item.ProductName ?? item.name ?? "Producto",
    price: Number(item.effectivePrice ?? item.Price ?? item.price ?? 0),
    category: item.category ?? item.Category ?? ""
  })) : [];
  renderProducts();
}

async function useLastUid(){
  try{
    const tid = state.terminalId || "BARRA-01";
    const res = await apiFetch(`/api/last-uid?terminalId=${encodeURIComponent(tid)}`, { method:"GET" });
    if(res.status === 401){
      clearSession();
      window.location.href = "/login.html";
      return;
    }
    const data = await res.json();
    const uid = String(data?.uid || "").trim();
    $("uidInput").value = uid;
  }catch(e){
    setPayMsg("No se pudo obtener último UID.", "err");
  }
}

async function pay(){
  const uid = String($("uidInput").value || "").trim();
  if(!uid) return setPayMsg("UID requerido.", "err");

  const items = Array.from(state.cart.values()).map(it => ({
    productId: it.id,
    quantity: it.qty,
    price: it.price
  }));
  if(items.length === 0) return setPayMsg("Agrega productos al carrito.", "err");

  const totals = getTotals();
  const payload = {
    areaId: Number(state.areaId),
    menuId: state.menuId ?? null,
    items,
    subtotal: totals.subtotal,
    tip: totals.tip,
    total: totals.total,
    uid,
    terminalId: state.terminalId || "BARRA-01"
  };

  setPayMsg("Procesando cobro...", "");

  const res = await apiFetch("/api/transactions", {
    method:"POST",
    body: JSON.stringify(payload)
  });

  if(res.status === 401){
    clearSession();
    window.location.href = "/login.html";
    return;
  }

  if(res.status === 400){
    const data = await res.json().catch(()=>null);
    const msg = data?.message || "Solicitud inválida";
    setPayMsg(msg, "err");
    return;
  }
  if(res.status === 402 || res.status === 409){
    setPayMsg("Saldo insuficiente.", "err");
    return;
  }
  if(!res.ok){
    setPayMsg(`Error ${res.status}`, "err");
    return;
  }

  setPayMsg("Cobro exitoso.", "ok");
  state.cart.clear();
  renderCart();
  $("uidInput").value = "";
}

function clearAll(){
  state.cart.clear();
  renderCart();
  $("uidInput").value = "";
  $("tipManual").value = "";
  $("tipPercent").value = "0";
  renderTotals();
  setPayMsg("", "");
}

function startUidAutoRefresh(){
  if(state.lastUidTimer) return;
  state.lastUidTimer = setInterval(()=>{
    if(document.hidden) return;
    useLastUid().catch(()=>{});
  }, 2000);
}
function stopUidAutoRefresh(){
  if(state.lastUidTimer){
    clearInterval(state.lastUidTimer);
    state.lastUidTimer = null;
  }
}

async function init(){
  setSessionInfo();
  setTerminalId(loadTerminalId());
  $("btnLogout").addEventListener("click", ()=>{
    clearSession();
    window.location.href = "/login.html";
  });

  $("terminalIdSave")?.addEventListener("click", ()=>{
    setTerminalId($("terminalIdInput")?.value || "");
  });

  $("q").addEventListener("input", renderProducts);
  $("tipPercent").addEventListener("change", renderTotals);
  $("tipManual").addEventListener("input", renderTotals);

  $("btnLastUid").addEventListener("click", ()=> useLastUid());
  $("btnPay").addEventListener("click", ()=> pay());
  $("btnClear").addEventListener("click", clearAll);

  await loadAreas();
  if(state.areaId){
    await loadProductsForArea(state.areaId);
  }

  $("areaSelect").addEventListener("change", async (e)=>{
    const id = Number(e.target.value);
    state.areaId = id;
    state.cart.clear();
    renderCart();
    await loadProductsForArea(id);
  });

  startUidAutoRefresh();
  document.addEventListener("visibilitychange", ()=>{
    if(document.hidden) stopUidAutoRefresh();
    else startUidAutoRefresh();
  });
}

init().catch(e=>{
  console.error("pos init error:", e);
  setPayMsg("Error inicializando POS.", "err");
});
