// wwwroot/barra.js
// ✅ Menú dinámico por barra (AreaProduct)
// ✅ Preselección por URL ?areaId=XX
// ✅ Carga Barra/Stand
// ✅ Recalcula categorías/products por menú real
// ✅ Cobra con tu endpoint /charge (backend ya bloquea 1 cobro por lectura)

requireSession();

// ===================== Terminal (independizar lecturas por caja) =====================
// Prioridad: ?terminalId=...  -> localStorage -> default
function getQueryParam(name){
  const u = new URL(location.href);
  return u.searchParams.get(name);
}

let terminalId = (getQueryParam("terminalId") || localStorage.getItem("terminalId") || "").trim();
if(!terminalId){
  // default seguro: usa nombre de PC si el backend lo manda; si no, usa BARRA-01
  terminalId = "BARRA-01";
}
localStorage.setItem("terminalId", terminalId);

function setTerminalId(newId){
  terminalId = (newId || "").trim() || "BARRA-01";
  localStorage.setItem("terminalId", terminalId);
  const el = document.getElementById("terminalIdInput");
  if(el) el.value = terminalId;
  const lab = document.getElementById("terminalIdLabel");
  if(lab) lab.textContent = terminalId;
}

const btnUid = $("btnUid");
const btnClear = $("btnClear");
const btnCharge = $("btnCharge");
const uidEl = $("uid");
const nameEl = $("name");
const balanceEl = $("balance");
const statusEl = $("status");

const barSelect = $("barSelect");

const terminalIdInput = document.getElementById("terminalIdInput");
const terminalIdSave = document.getElementById("terminalIdSave");
const terminalIdLabel = document.getElementById("terminalIdLabel");

// Init terminal UI
if(terminalIdInput){
  terminalIdInput.value = terminalId;
}
if(terminalIdLabel){
  terminalIdLabel.textContent = terminalId;
}
if(terminalIdSave && terminalIdInput){
  terminalIdSave.addEventListener("click", ()=>{
    setTerminalId(terminalIdInput.value);
    setIdle(`Terminal configurada: ${terminalId} ✅`);
  });
}

const catChips = $("catChips");
const prodGrid = $("prodGrid");

const cartList = $("cartList");
const subtotalEl = $("subtotal");
const tipEl = $("tip");
const totalEl = $("total");

const tipPercentBtns = document.querySelectorAll("[data-tip]");
const tipManualInput = $("tipManual");

let currentUid = null;
let currentName = null;
let currentBalance = 0;

// Área seleccionada para operar
let currentBarId = null;

// Menú actual cargado desde backend
let MENU = []; // {id, productId, name, price, cat}

// Carrito
const CART = []; // {id, name, price, qty}

let selectedCategory = null;
let tipPercent = 0;
let tipManual = null; // si es número, pisa %


// ===================== UI helpers =====================
function setIdle(msg){
  statusEl.textContent = msg || "";
  statusEl.style.color = "";
}

function setError(msg){
  statusEl.textContent = msg || "";
  statusEl.style.color = "#ff5a5a";
}

function money(n){
  const x = Number(n || 0);
  return x.toFixed(2);
}


// ===================== Render menu =====================
function renderCategories(){
  catChips.innerHTML = "";

  // si no hay menú
  if(!MENU || MENU.length === 0){
    catChips.innerHTML = `<span class="muted">Sin productos en esta barra (ve a “Menús” y agrega productos)</span>`;
    return;
  }

  const cats = [...new Set(MENU.map(x=>x.cat || "Sin categoría"))];

  const allBtn = document.createElement("button");
  allBtn.className = "chip" + (selectedCategory===null ? " on" : "");
  allBtn.textContent = "Todo";
  allBtn.onclick = ()=>{ selectedCategory=null; renderCategories(); renderProducts(); };
  catChips.appendChild(allBtn);

  for(const c of cats){
    const b = document.createElement("button");
    b.className = "chip" + (selectedCategory===c ? " on" : "");
    b.textContent = c;
    b.onclick = ()=>{ selectedCategory=c; renderCategories(); renderProducts(); };
    catChips.appendChild(b);
  }
}

function renderProducts(){
  prodGrid.innerHTML = "";

  if(!MENU || MENU.length === 0){
    prodGrid.innerHTML = `<div class="muted">No hay productos asignados a esta barra.</div>`;
    return;
  }

  const list = selectedCategory
    ? MENU.filter(x => (x.cat || "Sin categoría") === selectedCategory)
    : MENU;

  for(const p of list){
    const card = document.createElement("button");
    card.className = "prod";
    card.innerHTML = `
      <div class="pname">${p.name}</div>
      <div class="pprice">$${money(p.price)}</div>
    `;
    card.onclick = ()=> addToCart(p);
    prodGrid.appendChild(card);
  }
}


// ===================== Cart =====================
function addToCart(p){
  const found = CART.find(x=>x.id===p.id);
  if(found) found.qty += 1;
  else CART.push({ id:p.id, name:p.name, price:p.price, qty:1 });

  renderCart();
  renderTotals();
}

function decItem(id){
  const idx = CART.findIndex(x=>x.id===id);
  if(idx<0) return;
  CART[idx].qty -= 1;
  if(CART[idx].qty<=0) CART.splice(idx,1);
  renderCart();
  renderTotals();
}

function incItem(id){
  const it = CART.find(x=>x.id===id);
  if(!it) return;
  it.qty += 1;
  renderCart();
  renderTotals();
}

function clearCart(){
  CART.length = 0;
  renderCart();
  renderTotals();
}

function renderCart(){
  cartList.innerHTML = "";

  if(CART.length === 0){
    cartList.innerHTML = `<div class="muted">Carrito vacío</div>`;
    return;
  }

  for(const it of CART){
    const row = document.createElement("div");
    row.className = "cartRow";
    row.innerHTML = `
      <div class="cname">${it.name}</div>
      <div class="cqty">
        <button class="mini" data-dec="${it.id}">-</button>
        <div class="q">${it.qty}</div>
        <button class="mini" data-inc="${it.id}">+</button>
      </div>
      <div class="cprice">$${money(it.qty * it.price)}</div>
    `;
    cartList.appendChild(row);
  }

  cartList.querySelectorAll("[data-dec]").forEach(b=>{
    b.addEventListener("click", ()=>decItem(b.dataset.dec));
  });
  cartList.querySelectorAll("[data-inc]").forEach(b=>{
    b.addEventListener("click", ()=>incItem(b.dataset.inc));
  });
}

function calcSubtotal(){
  return CART.reduce((sum,it)=> sum + (it.qty*it.price), 0);
}

function calcTip(sub){
  if(tipManual !== null && !isNaN(tipManual)) return Math.max(0, tipManual);
  return sub * (tipPercent / 100);
}

function renderTotals(){
  const sub = calcSubtotal();
  const tip = calcTip(sub);
  const total = sub + tip;

  subtotalEl.textContent = "$" + money(sub);
  tipEl.textContent = "$" + money(tip);
  totalEl.textContent = "$" + money(total);
}


// ===================== Load Bars + Menu =====================
async function loadBars(){
  // usamos /areas público (solo activas)
  const areas = await apiJson("/areas");

  // Centros de consumo para POS: Barra y Stand
  const bars = (areas || []).filter(a => {
    const t = (a.type || "").toLowerCase();
    return t === "barra" || t === "stand";
  });

  if(bars.length === 0){
    barSelect.innerHTML = `<option value="">(No hay barras/stands activos)</option>`;
    currentBarId = null;
    setIdle("No hay barras/stands activos");
    return;
  }

  barSelect.innerHTML = bars.map(b => `<option value="${b.id}">${b.name}</option>`).join("");

  // ✅ Preseleccionar por URL: ?areaId=3 (o ?barId=3)
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("areaId") || params.get("barId");
  if(fromUrl && bars.some(b => String(b.id) === String(fromUrl))){
    barSelect.value = String(fromUrl);
  }

  currentBarId = parseInt(barSelect.value, 10);

  setIdle(`Barra seleccionada: ${barSelect.options[barSelect.selectedIndex].text}`);
  await loadMenuForArea(currentBarId);
}

async function loadMenuForArea(areaId){
  if(!areaId){
    MENU = [];
    selectedCategory = null;
    renderCategories();
    renderProducts();
    return;
  }

  setIdle("Cargando menú...");
  const links = await apiJson(`/api/areas/${areaId}/products`);

  // Solo links activos y productos activos
  const active = (links || []).filter(x => x.isActive && x.productIsActive);

  // Normalizamos a estructura del POS
  MENU = active.map(x => ({
    id: String(x.productId),                 // clave por producto
    productId: x.productId,
    name: x.productName,
    price: Number(x.effectivePrice ?? x.basePrice ?? 0),
    cat: x.category || "Sin categoría"
  }));

  // Reset categoría si ya no existe
  selectedCategory = null;

  renderCategories();
  renderProducts();
  setIdle(MENU.length ? "Menú cargado ✅" : "Esta barra no tiene productos asignados.");
}


// ===================== NFC / UID =====================
async function readUidOnce(){
  const r = await fetch(`/last-uid?terminalId=${encodeURIComponent(terminalId)}`);
  if(!r.ok) return null;
  const j = await r.json();
  return j.uid || null;
}

async function loadCardInfo(uid){
  const data = await apiJson(`/cards/${encodeURIComponent(uid)}`);
  currentUid = uid;
  currentName = data.userName;
  currentBalance = Number(data.balance || 0);

  uidEl.textContent = uid;
  nameEl.textContent = currentName || "-";
  balanceEl.textContent = "$" + money(currentBalance);
}

function clearUser(){
  currentUid = null;
  currentName = null;
  currentBalance = 0;
  uidEl.textContent = "-";
  nameEl.textContent = "-";
  balanceEl.textContent = "$0.00";
}


// ===================== Cobro =====================
async function doCharge(){
  if(!currentBarId){
    return setError("Selecciona una barra/stand antes de cobrar.");
  }
  if(!currentUid){
    return setError("Primero lee una pulsera.");
  }
  if(CART.length === 0){
    return setError("Carrito vacío.");
  }

  const sub = calcSubtotal();
  const tip = calcTip(sub);
  const total = sub + tip;

  const result = await apiJson("/charge", {
    method: "POST",
    body: JSON.stringify({ uid: currentUid, amount: total, terminalId })
  });

  currentBalance = Number(result.newBalance || 0);
  balanceEl.textContent = "$" + money(currentBalance);

  clearCart();
  setIdle(`Cobrado $${money(total)} ✅`);
}


// ===================== Tip handlers =====================
tipPercentBtns.forEach(b=>{
  b.addEventListener("click", ()=>{
    tipManual = null;
    tipManualInput.value = "";
    tipPercent = parseInt(b.dataset.tip, 10) || 0;

    tipPercentBtns.forEach(x=>x.classList.remove("on"));
    b.classList.add("on");

    renderTotals();
  });
});

tipManualInput.addEventListener("input", ()=>{
  const v = tipManualInput.value.trim();
  if(!v){
    tipManual = null;
  }else{
    const n = Number(v);
    tipManual = isNaN(n) ? null : n;
  }
  tipPercentBtns.forEach(x=>x.classList.remove("on"));
  tipPercent = 0;
  renderTotals();
});


// ===================== Events =====================
barSelect.addEventListener("change", async ()=>{
  try{
    if(!barSelect.value){
      currentBarId = null;
      MENU = [];
      selectedCategory = null;
      setIdle("Selecciona una barra");
      renderCategories();
      renderProducts();
      return;
    }
    currentBarId = parseInt(barSelect.value, 10);
    setIdle(`Barra seleccionada: ${barSelect.options[barSelect.selectedIndex].text}`);
    await loadMenuForArea(currentBarId);
  }catch(e){
    setError("Error cargando menú: " + (e.message || e));
  }
});

btnUid.addEventListener("click", async ()=>{
  try{
    setIdle("Leyendo pulsera...");
    const uid = await readUidOnce();
    if(!uid) return setError("No hay pulsera (acerca la tarjeta).");
    await loadCardInfo(uid);
    setIdle("Pulsera leída ✅");
  }catch(e){
    setError("Error leyendo pulsera: " + (e.message || e));
  }
});

btnClear.addEventListener("click", ()=>{
  clearUser();
  clearCart();
  setIdle("Limpio ✅");
});

btnCharge.addEventListener("click", async ()=>{
  try{
    await doCharge();
  }catch(e){
    setError("Error cobrando: " + (e.message || e));
  }
});


// ===================== Init =====================
(async function init(){
  try{
    renderCart();
    renderTotals();
    await loadBars(); // también carga menú
  }catch(e){
    setError("Error inicializando POS: " + (e.message || e));
  }
})();
