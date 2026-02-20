(() => {
  const $ = (sel) => document.querySelector(sel);

  const ROLES = ["SuperAdmin","Admin","JefeOperativo","JefeDeBarra","JefeDeStand"];

  // Matriz local (fallback)
  const LOCAL_SCHEMA = {
    roles: ROLES,
    permissions: [
      { key:"dashboard_view", title:"Ver dashboard", desc:"Acceso al panel principal." },
      { key:"pos_use",        title:"Usar POS",       desc:"Cobrar con pulsera en barra/stand." },
      { key:"topup",          title:"Recargar saldo", desc:"Hacer recargas (top-up) a pulseras." },
      { key:"charge",         title:"Cobrar",         desc:"Aplicar cargos (charge) a pulseras." },
      { key:"users_manage",   title:"Usuarios",       desc:"Crear/editar usuarios y asignar pulseras." },
      { key:"areas_manage",   title:"Barras / Áreas", desc:"Crear/editar barras, stands, tipos y customType." },
      { key:"products_manage",title:"Productos",      desc:"Crear/editar catálogo de productos." },
      { key:"menus_manage",   title:"Menús por barra",desc:"Asignar productos por barra (AreaProduct)." },
      { key:"operators_manage",title:"Colaboradores", desc:"Crear/editar/desactivar operadores." },
      { key:"reports_view",   title:"Reportes",       desc:"Ver estadísticas de ventas/consumo." },
      { key:"permissions_view",title:"Ver permisos",  desc:"Ver matriz de permisos por rol." },
      { key:"permissions_manage",title:"Administrar permisos",desc:"Cambiar permisos (solo SuperAdmin)." },
    ],
    matrix: {
      SuperAdmin: {
        dashboard_view:true,pos_use:true,topup:true,charge:true,users_manage:true,areas_manage:true,
        products_manage:true,menus_manage:true,operators_manage:true,reports_view:true,
        permissions_view:true,permissions_manage:true
      },
      Admin: {
        dashboard_view:true,pos_use:true,topup:true,charge:true,users_manage:true,areas_manage:true,
        products_manage:true,menus_manage:true,operators_manage:true,reports_view:true,
        permissions_view:true,permissions_manage:false
      },
      JefeOperativo: {
        dashboard_view:true,pos_use:false,topup:true,charge:false,users_manage:true,areas_manage:true,
        products_manage:true,menus_manage:true,operators_manage:false,reports_view:true,
        permissions_view:true,permissions_manage:false
      },
      JefeDeBarra: {
        dashboard_view:true,pos_use:true,topup:false,charge:true,users_manage:false,areas_manage:false,
        products_manage:false,menus_manage:false,operators_manage:false,reports_view:false,
        permissions_view:false,permissions_manage:false
      },
      JefeDeStand: {
        dashboard_view:true,pos_use:true,topup:false,charge:true,users_manage:false,areas_manage:false,
        products_manage:false,menus_manage:false,operators_manage:false,reports_view:false,
        permissions_view:false,permissions_manage:false
      }
    }
  };

  function setStatus(kind, msg){
    const el = $("#status");
    el.className = "status" + (kind ? (" " + kind) : "");
    el.textContent = msg;
  }

  function icon(ok){
    return `<span class="pill ${ok ? "ok":"no"}">${ok ? "✓" : "–"}</span>`;
  }

  function renderTable(schema){
    const thead = $("#tbl thead");
    const tbody = $("#tbl tbody");

    thead.innerHTML = `
      <tr>
        <th style="min-width:280px;text-align:left">Permiso</th>
        ${schema.roles.map(r => `<th style="min-width:120px;text-align:center">${r.toUpperCase()}</th>`).join("")}
      </tr>
    `;

    tbody.innerHTML = schema.permissions.map(p => `
      <tr>
        <td>
          <div class="perm-title">${p.title}</div>
          <div class="perm-desc">${p.desc || ""}</div>
        </td>
        ${schema.roles.map(r => `<td style="text-align:center">${icon(!!(schema.matrix?.[r]?.[p.key]))}</td>`).join("")}
      </tr>
    `).join("");
  }

  async function loadFromApiWithTimeout(ms){
    // usamos apiJson() de common.js, pero con timeout duro
    const apiCall = (async () => {
      const data = await apiJson("/api/permissions"); // <-- protegido
      return data;
    })();

    const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms));
    return Promise.race([apiCall, timeout]);
  }

  async function boot(){
    // botones
    $("#btnDash").addEventListener("click", () => location.href = "dashboard.html");
    $("#btnReload").addEventListener("click", () => boot().catch(console.error));

    // sesión
    const s = requireSession();
    if (!s) { location.href = "login.html"; return; }

    setStatus("", "Cargando...");

    // intento API (si falla o se cuelga -> local)
    try {
      const data = await loadFromApiWithTimeout(2500);

      // Si el backend responde un objeto ya listo para renderizar
      // esperamos { roles:[], permissions:[], matrix:{} }.
      if (!data || !data.roles || !data.permissions || !data.matrix) {
        throw new Error("bad-shape");
      }

      renderTable(data);
      setStatus("ok", "Cargado desde backend (/api/permissions).");
    } catch (e) {
      renderTable(LOCAL_SCHEMA);

      // Mensajes más útiles
      const msg =
        (e && e.message === "timeout")
          ? "Modo local: /api/permissions tardó demasiado (timeout)."
          : "Modo local: el servidor no respondió /api/permissions o estás sin permiso.";

      setStatus("warn", msg);
    }
  }

  window.addEventListener("DOMContentLoaded", () => {
    boot().catch(err => {
      console.error(err);
      renderTable(LOCAL_SCHEMA);
      setStatus("err", "Error cargando permisos. Revisa consola y que estés logueado.");
    });
  });
})();
