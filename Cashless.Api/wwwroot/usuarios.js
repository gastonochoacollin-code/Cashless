function $(id){ return document.getElementById(id); }

const sessionInfoEl = $("sessionInfo");
const statusEl = $("status");

const btnRefresh = $("btnRefresh");
const btnLogout = $("btnLogout");
const btnGoAdmin = $("btnGoAdmin");
const btnGoBarra = $("btnGoBarra");

const qEl = $("q");
const tbody = $("tbody");
const countEl = $("count");
const jsDot = $("jsDot");

// ReasignaciÃ³n UI
const selectedUserEl = $("selectedUser");
const btnTakeLastUid = $("btnTakeLastUid");
const uidPreviewEl = $("uidPreview");
const uidManualEl = $("uidManual");
const btnAssign = $("btnAssign");

let session = null;
let users = [];
let selectedUser = null;
let selectedUid = null;

function setStatus(msg){ statusEl.textContent = msg; }

function getSession(){
  const raw = localStorage.getItem("cashless.session");
  if(!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function logout(){
  localStorage.removeItem("cashless.session");
  window.location.href = "/login.html";
}

function goAdmin(){ window.location.href = "/admin.html"; }
function goBarra(){ window.location.href = "/barra.html"; }

async function api(path, opts = {}){
  return await apiJson(path, opts);
}

function esc(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function money(n){
  const x = Number(n ?? 0);
  return "$" + x.toFixed(2);
}

function setSelectedUser(u){
  selectedUser = u;
  selectedUserEl.textContent = u ? `#${u.id} â€” ${u.name}` : "Ninguno";
  updateAssignButtonState();
}

function setSelectedUid(uid){
  selectedUid = uid ? normalizeUid(uid) : null;
  uidPreviewEl.textContent = selectedUid || "â€”";
  updateAssignButtonState();
}

function updateAssignButtonState(){
  const manual = normalizeUid(uidManualEl.value);
  const uidToUse = manual || selectedUid;
  btnAssign.disabled = !(selectedUser && uidToUse && uidToUse.length >= 4);
}

function matchesQuery(u, q){
  if(!q) return true;
  const t = q.toLowerCase();
  return (
    (u.name || "").toLowerCase().includes(t) ||
    (u.email || "").toLowerCase().includes(t) ||
    (u.phone || "").toLowerCase().includes(t)
  );
}

function render(){
  const q = (qEl.value || "").trim();
  const filtered = users.filter(u => matchesQuery(u, q));
  countEl.textContent = String(filtered.length);

  if(filtered.length === 0){
    tbody.innerHTML = `<tr><td colspan="8" class="muted">Sin resultados</td></tr>`;
    return;
  }

  // IMPORTANTÃSIMO: este orden debe coincidir con el THEAD del HTML
  tbody.innerHTML = filtered.map(u => `
    <tr>
      <td class="mono">${u.id}</td>
      <td>${esc(u.name)}</td>

      <td>
        <span class="jsEmailView">${esc(u.email ?? "-")}</span>
        <input class="jsEmailEdit" style="display:none; width:100%; min-width:220px;"
               value="${esc(u.email ?? "")}" placeholder="email@..." />
      </td>

      <td class="mono">
        <span class="jsPhoneView">${esc(u.phone ?? "-")}</span>
        <input class="jsPhoneEdit mono" style="display:none; width:100%; min-width:140px;"
               value="${esc(u.phone ?? "")}" placeholder="telÃ©fono" />
      </td>

      <td class="mono">${money(u.balance)}</td>
      <td class="mono">${money(u.totalSpent ?? u.totalspent ?? 0)}</td>
      <td class="muted mono">${esc(u.createdAt)}</td>

      <td>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="btnSmall alt" data-pick="${u.id}">Seleccionar</button>
          <button class="btnSmall alt" data-edit="${u.id}">Editar</button>
          <button class="btnSmall green" data-save="${u.id}" style="display:none;">Guardar</button>
          <button class="btnSmall red" data-cancel="${u.id}" style="display:none;">Cancelar</button>
        </div>
      </td>
    </tr>
  `).join("");

  // Select user
  tbody.querySelectorAll("button[data-pick]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = Number(btn.getAttribute("data-pick"));
      const u = users.find(x => x.id === id);
      setSelectedUser(u || null);
      setStatus(u ? `Seleccionado: #${u.id} ${u.name}` : "Selecciona un usuario");
    });
  });

  // Inline edit handlers
  tbody.querySelectorAll("button[data-edit]").forEach(btn => {
    btn.addEventListener("click", () => toggleEditRow(btn, true));
  });
  tbody.querySelectorAll("button[data-cancel]").forEach(btn => {
    btn.addEventListener("click", () => toggleEditRow(btn, false, true));
  });
  tbody.querySelectorAll("button[data-save]").forEach(btn => {
    btn.addEventListener("click", () => saveRow(btn));
  });
}

function toggleEditRow(btn, editing, reset=false){
  const tr = btn.closest("tr");
  if(!tr) return;

  const emailView = tr.querySelector(".jsEmailView");
  const emailEdit = tr.querySelector(".jsEmailEdit");
  const phoneView = tr.querySelector(".jsPhoneView");
  const phoneEdit = tr.querySelector(".jsPhoneEdit");

  const editBtn = tr.querySelector('button[data-edit]');
  const saveBtn = tr.querySelector('button[data-save]');
  const cancelBtn = tr.querySelector('button[data-cancel]');

  if(editing){
    emailView.style.display = "none";
    phoneView.style.display = "none";
    emailEdit.style.display = "inline-block";
    phoneEdit.style.display = "inline-block";
    editBtn.style.display = "none";
    saveBtn.style.display = "inline-block";
    cancelBtn.style.display = "inline-block";
    emailEdit.focus();
  } else {
    if(reset){
      // restore values from current users[] (not the typed ones)
      const id = Number(editBtn.getAttribute("data-edit"));
      const u = users.find(x => x.id === id);
      emailEdit.value = u?.email ?? "";
      phoneEdit.value = u?.phone ?? "";
    }

    emailView.style.display = "inline";
    phoneView.style.display = "inline";
    emailEdit.style.display = "none";
    phoneEdit.style.display = "none";
    editBtn.style.display = "inline-block";
    saveBtn.style.display = "none";
    cancelBtn.style.display = "none";
  }
}

async function saveRow(btn){
  const tr = btn.closest("tr");
  if(!tr) return;

  const saveBtn = tr.querySelector('button[data-save]');
  const editBtn = tr.querySelector('button[data-edit]');
  const id = Number((saveBtn || editBtn).getAttribute("data-save") || (saveBtn || editBtn).getAttribute("data-edit"));

  const emailEdit = tr.querySelector(".jsEmailEdit");
  const phoneEdit = tr.querySelector(".jsPhoneEdit");

  const newEmail = (emailEdit.value || "").trim();
  const newPhone = (phoneEdit.value || "").trim();

  setStatus(`Guardando contacto de usuario #${id}â€¦`);
  try{
    const updated = await api(`/api/users/${id}/contact`, {
      method: "PUT",
      body: JSON.stringify({ email: newEmail || null, phone: newPhone || null })
    });

    // Actualiza cache local
    users = users.map(u => u.id === id ? { ...u, email: updated.email, phone: updated.phone } : u);

    setStatus("OK Â· Contacto actualizado");
    render();
  } catch(e){
    setStatus(`Error: ${e.message}`);
  }
}

async function refresh(){
  setStatus("Cargando usuariosâ€¦");
  try{
    users = await api("/api/users", { method:"GET" });
    setStatus(`OK Â· ${users.length} usuarios cargados`);
    render();
  } catch(e){
    setStatus(`Error: ${e.message}`);
    tbody.innerHTML = `<tr><td colspan="8" class="muted">No se pudo cargar</td></tr>`;
  }
}

async function takeLastUid(){
  setStatus("Leyendo última pulsera...");
  try{
    const uid = await apiGetLastUid();
    if(!uid){
      setStatus("No hay pulsera leída. Acerca una tarjeta al lector.");
      return;
    }
    setSelectedUid(uid);
    setStatus(`UID capturado: ${normalizeUid(uid)}`);
  } catch(e){
    setStatus(`Error: ${e.message}`);
  }
}

async function reassign(){
  const manual = normalizeUid(uidManualEl.value);
  const uidToUse = manual || selectedUid;

  if(!selectedUser) { setStatus("Selecciona un usuario."); return; }
  if(!uidToUse) { setStatus("Captura o pega un UID."); return; }

  setStatus("Reasignando pulseraâ€¦");
  try{
    await api("/api/reassign-card", {
      method: "POST",
      body: JSON.stringify({ userId: selectedUser.id, uid: uidToUse })
    });

    uidManualEl.value = "";
    setSelectedUid(null);

    setStatus(`OK Â· Pulsera asignada a #${selectedUser.id} (${selectedUser.name})`);
  } catch(e){
    setStatus(`Error: ${e.message}`);
  }
}

function init(){
  if(jsDot) jsDot.style.color = "#35ff7a";
  renderAppMenu("appMenu", "/usuarios.html");

  session = getSession();
  if(!session?.operatorId || !session?.token){
    setStatus("Sin sesiÃ³n. Redirigiendo a loginâ€¦");
    setTimeout(()=> window.location.href="/login.html", 600);
    return;
  }

  sessionInfoEl.textContent = `${session.name} Â· ${session.role} Â· ${session.area ?? "-"}`;

  btnRefresh.addEventListener("click", refresh);
  btnLogout.addEventListener("click", logout);
  btnGoAdmin.addEventListener("click", goAdmin);
  btnGoBarra.addEventListener("click", goBarra);
  qEl.addEventListener("input", render);

  btnTakeLastUid.addEventListener("click", takeLastUid);
  uidManualEl.addEventListener("input", updateAssignButtonState);
  btnAssign.addEventListener("click", reassign);

  refresh();
}

init();


