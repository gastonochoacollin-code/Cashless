// wwwroot/recargas.js
(() => {
  const el = (id) => document.getElementById(id);

  const session = requireSession();
  if (typeof renderAppMenu === "function") {
    renderAppMenu("appMenu", "/recargas.html");
  }

  const TERMINAL_KEY = "cashless.terminalId";

  function loadTerminalId(){
    const stored = (sessionStorage.getItem(TERMINAL_KEY) || "").trim();
    return stored || "BARRA-01";
  }

  function setTerminalId(newId){
    const clean = (newId || "").trim() || "BARRA-01";
    sessionStorage.setItem(TERMINAL_KEY, clean);
    const select = el("terminalSelect");
    const label = el("terminalLabel");
    if(select){
      let opt = Array.from(select.options).find(o => o.value === clean);
      if(!opt){
        opt = document.createElement("option");
        opt.value = clean;
        opt.textContent = clean;
        select.appendChild(opt);
      }
      select.value = clean;
    }
    if(label) label.textContent = clean;
  }

  function initTerminalSelect(){
    const select = el("terminalSelect");
    if(!select) return;
    const defaults = ["BARRA-01", "BARRA-02", "BARRA-03", "CAJA-01", "CAJA-02"];
    select.innerHTML = "";
    for(const t of defaults){
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      select.appendChild(opt);
    }
    setTerminalId(loadTerminalId());
    select.addEventListener("change", () => {
      setTerminalId(select.value);
    });
  }

  function setStatus(msg, ok){
    const box = el("statusBox");
    if(!box) return;
    if(!msg){
      box.style.display = "none";
      box.textContent = "";
      box.className = "status";
      return;
    }
    box.style.display = "block";
    box.textContent = msg;
    box.className = ok ? "status ok" : "status bad";
  }

  function setUserInfo(name, balance){
    el("userName").textContent = name || "-";
    el("userBalance").textContent = (balance ?? "-").toString();
  }

  function getUid(){
    return normalizeUid(el("uidInput").value || "");
  }

  async function readErrorMessage(res){
    const text = await res.text().catch(() => "");
    if(!text) return res.statusText || "Error";
    try{
      const data = JSON.parse(text);
      return data?.message || text;
    }catch{
      return text;
    }
  }

  async function readUid(){
    setStatus("", false);
    try{
      const tid = loadTerminalId();
      const uid = await apiGetLastUid(tid);
      el("uidInput").value = uid || "";
      if(!uid){
        setUserInfo("-", "-");
        setStatus("Sin UID leido", false);
        return;
      }
      await lookupUid();
    }catch(e){
      setUserInfo("-", "-");
      setStatus("No se pudo leer UID", false);
    }
  }

  async function lookupUid(){
    setStatus("", false);
    const uid = getUid();
    if(!uid){
      setStatus("UID requerido", false);
      return;
    }

    try{
      const res = await apiFetch(`/api/cards/${encodeURIComponent(uid)}`, { method:"GET" });
      if(res.status === 401){
        clearSession();
        location.href = "/login.html";
        return;
      }
      if(res.status !== 200){
        const msg = await readErrorMessage(res);
        setUserInfo("-", "-");
        setStatus(`ERROR ${res.status}: ${msg}`, false);
        return;
      }
      const card = await res.json();
      setUserInfo(card.userName || "Usuario", card.balance ?? 0);
      setStatus(`Tarjeta OK (UID ${uid})`, true);
    }catch(e){
      setUserInfo("-", "-");
      setStatus(`ERROR: ${String(e?.message || "Error buscando tarjeta")}`, false);
    }
  }

  async function topup(){
    setStatus("", false);
    const uid = getUid();
    if(!uid) return setStatus("UID requerido", false);

    const amount = Number(el("amountInput").value);
    if(!Number.isFinite(amount) || amount <= 0){
      return setStatus("Monto invalido", false);
    }

    try{
      const res = await apiFetch("/api/topup", {
        method:"POST",
        body: JSON.stringify({ uid, amount })
      });
      if(res.status === 401){
        clearSession();
        location.href = "/login.html";
        return;
      }
      if(res.status !== 200){
        const msg = await readErrorMessage(res);
        setStatus(`ERROR ${res.status}: ${msg}`, false);
        return;
      }
      const data = await res.json();

      const balance = data?.newBalance ?? data?.balance ?? null;
      if(balance !== null){
        setUserInfo(el("userName").textContent, balance);
      }
      setStatus(data?.message || "Recarga OK", true);
    }catch(e){
      setStatus(`ERROR: ${String(e?.message || "Error al recargar")}`, false);
    }
  }

  function init(){
    el("sessionInfo").textContent = `${session.name || "Sesion"} - ${session.role || ""}`.trim();
    initTerminalSelect();
    el("terminalSave").addEventListener("click", () => {
      setTerminalId(el("terminalSelect").value);
    });

    el("btnReadUid").addEventListener("click", readUid);
    el("btnLookup").addEventListener("click", lookupUid);
    el("btnTopup").addEventListener("click", topup);
    el("btnQuick500").addEventListener("click", () => {
      el("amountInput").value = 500;
      el("amountInput").focus();
    });
    el("btnLogout").addEventListener("click", () => {
      clearSession();
      location.href = "/login.html";
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();


