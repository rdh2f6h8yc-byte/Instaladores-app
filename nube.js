// Conexión con Supabase (sesión, datos y fotos). Sin librerías externas.
"use strict";
window.Nube = (() => {
  const C = window.ALMARA_CONFIG || {};
  // ---------- Equipo: "ver como" (el administrador abre los datos de un técnico) ----------
  // Mientras se ve a un técnico, sus datos se guardan en el móvil aparte de los tuyos.
  const DATOS = ["almara-clientes-v1", "almara-planos-v1", "almara-pres-v1", "almara-material-v1",
    "almara-ts-clientes", "almara-ts-planos", "almara-ts-presupuestos", "almara-ts-material", "almara-fotos-pend"];
  const verComo = () => { try { return JSON.parse(sessionStorage.getItem("almara-ver")); } catch (e) { return null; } };
  (() => {
    const P = Storage.prototype, g = P.getItem, st = P.setItem, rm = P.removeItem;
    const map = function (k) { const v = this === window.localStorage && DATOS.includes(k) && verComo(); return v ? "almara-ver-" + v.uid + "-" + k : k; };
    P.getItem = function (k) { return g.call(this, map.call(this, k)); };
    P.setItem = function (k, v) { return st.call(this, map.call(this, k), v); };
    P.removeItem = function (k) { return rm.call(this, map.call(this, k)); };
  })();
  const URLB = String(C.supabaseUrl || "").replace(/\/+$/, ""), KEY = String(C.supabaseAnonKey || "");
  const SK = "almara-sesion", PEND = "almara-fotos-pend";
  // Qué se sincroniza y dónde vive en el móvil
  const CLAVES = {
    clientes: ["almara-clientes-v1"],
    planos: ["almara-planos-v1"],
    presupuestos: ["almara-pres-v1"],
    empresa: ["almara-empresa-v1", "almara-tarifas-v1"],
    material: ["almara-material-v1"]
  };
  const configurado = () => /^https:\/\//.test(URLB) && KEY.length > 30;
  const sesion = () => { try { return JSON.parse(localStorage.getItem(SK)); } catch (e) { return null; } };
  const setSesion = s => { try { s ? localStorage.setItem(SK, JSON.stringify(s)) : localStorage.removeItem(SK); } catch (e) {} };
  const guardaSesion = r => setSesion({ access_token: r.access_token, refresh_token: r.refresh_token,
    expires_at: Date.now() / 1000 + (r.expires_in || 3600), user: { id: r.user.id, email: r.user.email } });

  async function pedir(path, opt = {}, ms = 9000) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(URLB + path, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
  }
  async function entrar(email, password) {
    const r = await pedir("/auth/v1/token?grant_type=password", { method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.error || ("Error " + r.status));
    // Si en este móvil había datos de otra cuenta, se borran (para no mezclarlos)
    sessionStorage.removeItem("almara-ver");
    const dueno = localStorage.getItem("almara-dueno");
    if (dueno && dueno !== j.user.id) { for (const k of DATOS) localStorage.removeItem(k); localStorage.removeItem("almara-ts-empresa");
      for (const k of ["almara-empresa-v1", "almara-tarifas-v1", "almara-contactos-cache", "almara-perfil"]) localStorage.removeItem(k); }
    localStorage.setItem("almara-dueno", j.user.id);
    guardaSesion(j); await cargarPerfil().catch(() => {}); return j;
  }
  // ---------- Perfil: administrador o técnico ----------
  function perfil() {
    const s = sesion(); let p = null;
    try { p = JSON.parse(localStorage.getItem("almara-perfil")); } catch (e) {}
    if (!s) return null;
    if (!p || p.user_id !== s.user.id) return { user_id: s.user.id, rol: "sin_empresa", nombre: "", serie: "", provisional: true };
    return p;
  }
  async function cargarPerfil() {
    if (!configurado() || !sesion()) return perfil();
    const r = await pedir("/rest/v1/rpc/mi_perfil", { method: "POST", headers: await cab({ "Content-Type": "application/json" }), body: "{}" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    const p = await r.json(); localStorage.setItem("almara-perfil", JSON.stringify(p));
    if (p.rol !== "admin") sessionStorage.removeItem("almara-ver");
    return p;
  }
  const esAdmin = () => { const p = perfil(); return !p || p.rol === "admin"; };
  // Cuenta recién creada que todavía no ha dado de alta su empresa (ni ha sido invitada a una)
  const sinEmpresa = () => { const p = perfil(); return !!p && p.rol === "sin_empresa" && !p.provisional; };
  const deBaja = () => { const p = perfil(); return !!p && p.rol === "baja"; };
  // Prueba o suscripción en vigor (si no, la app queda en solo lectura)
  const activa = () => { const p = perfil(); return !p || p.provisional || p.activa !== false; };
  const diasPrueba = () => { const p = perfil(); if (!p || !p.prueba_hasta) return null;
    if (p.pagado_hasta && Date.parse(p.pagado_hasta) > Date.now()) return null;
    return Math.ceil((Date.parse(p.prueba_hasta) - Date.now()) / 864e5); };
  // Alta de cuenta nueva. Devuelve {confirmar:true} si Supabase pide confirmar el correo antes de entrar.
  async function registrar(email, password) {
    const r = await pedir("/auth/v1/signup", { method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error_description || j.msg || j.error || ("Error " + r.status));
    if (!j.access_token) return { confirmar: true };
    return entrar(email, password);
  }
  // Da de alta la empresa de quien ha entrado (pasa a ser su administrador)
  async function crearEmpresa(empresa, nombre) {
    const r = await api("rpc/crear_empresa", { method: "POST", body: JSON.stringify({ p_empresa: empresa, p_nombre: nombre }) });
    if (r !== "ok" && r !== "ya_tienes") return r;
    await cargarPerfil();
    // La marca que sale en presupuestos y partes empieza siendo el nombre de la empresa
    try { const e = JSON.parse(localStorage.getItem("almara-empresa-v1") || "{}");
      if (!e.marca) { e.marca = empresa; e.titular = e.titular || nombre; e.email = e.email || sesion().user.email;
        localStorage.setItem("almara-empresa-v1", JSON.stringify(e)); marcar("empresa"); } } catch (e) {}
    return "ok";
  }
  const esTecnico = () => { const p = perfil(); return !!p && p.rol !== "admin"; };
  // Serie de numeración (P-2026-J001): la del técnico, o la del técnico que estás viendo
  const serie = () => { const v = verComo(); if (v) return v.serie || ""; const p = perfil(); return p && p.rol !== "admin" ? (p.serie || "") : ""; };
  const objetivo = () => { const v = verComo(); return v ? v.uid : sesion().user.id; };
  function ver(m) { // m = {uid, nombre, serie} o null para volver a lo tuyo
    if (m) sessionStorage.setItem("almara-ver", JSON.stringify({ uid: m.uid, nombre: m.nombre, serie: m.serie || "" }));
    else sessionStorage.removeItem("almara-ver");
  }
  // Solo para páginas del administrador (contactos, estadísticas)
  function soloAdmin() {
    if (esTecnico()) { location.replace("/"); return false; }
    cargarPerfil().then(p => { if (p && p.rol !== "admin") location.replace("/"); }).catch(() => {});
    return true;
  }
  async function token() {
    const s = sesion();
    if (!s) throw Object.assign(new Error("Sin sesión"), { auth: true });
    if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
    const r = await pedir("/auth/v1/token?grant_type=refresh_token", { method: "POST",
      headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: s.refresh_token }) });
    if (r.status === 400 || r.status === 401) { setSesion(null); throw Object.assign(new Error("Sesión caducada"), { auth: true }); }
    if (!r.ok) throw new Error("Sin conexión");
    const j = await r.json(); guardaSesion(j); return j.access_token;
  }
  const cab = async extra => ({ apikey: KEY, Authorization: "Bearer " + await token(), ...extra });
  // Lista del equipo (solo administrador)
  async function equipo() { return api("equipo?select=user_id,email,nombre,rol,serie&order=creado"); }
  // Compañeros invitados que aún no se han registrado
  async function invitaciones() { return api("invitaciones?select=email,nombre,serie&order=creado"); }
  // Datos de todos (solo administrador): {user_id: {clave: valor}}
  async function datosEquipo(claves) {
    const filas = await api("datos?select=user_id,clave,valor&clave=in.(" + claves.join(",") + ")"), o = {};
    for (const f of filas) (o[f.user_id] = o[f.user_id] || {})[f.clave] = f.valor;
    return o;
  }
  // Aviso fijo arriba mientras ves los datos de un técnico
  function bandaVer() {
    const v = verComo(); if (!v || document.getElementById("bandaVer")) return;
    const b = document.createElement("a"); b.id = "bandaVer"; b.href = "#";
    b.style.cssText = "position:fixed;z-index:9999;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top,0px) + 2px);background:#E8730C;color:#fff;font:700 12px -apple-system,Helvetica,Arial,sans-serif;padding:5px 12px;border-radius:20px;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap;text-decoration:none";
    b.textContent = "👁 Viendo a " + v.nombre + " · Volver a lo mío";
    b.onclick = e => { e.preventDefault(); ver(null); location.href = "/"; };
    document.body.appendChild(b);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bandaVer); else setTimeout(bandaVer);
  function salir() {
    sessionStorage.removeItem("almara-ver");
    const s = sesion();
    if (s && configurado()) pedir("/auth/v1/logout", { method: "POST", headers: { apikey: KEY, Authorization: "Bearer " + s.access_token } }).catch(() => {});
    setSesion(null);
  }
  // Si no hay sesión, a la portada. Sin Supabase configurado, la app funciona solo en el móvil.
  function requerir() {
    if (!configurado()) return true;
    if (!sesion()) { location.replace("/?volver=" + encodeURIComponent(location.pathname + location.search)); return false; }
    // Sin empresa dada de alta (o de baja) no hay nada que ver: a la portada
    const p = perfil(); if (p && (p.rol === "sin_empresa" || p.rol === "baja")) { location.replace("/"); return false; }
    return true;
  }

  // ---------- Estado visible ----------
  let est = { t: "", c: "" };
  function estado(t, c) { est = { t, c }; const el = document.getElementById("nubeEst"); if (el) { el.title = t; el.style.color = c; } }
  const OK = "#7BD99B", PENDIENTE = "#F5B266", OFF = "#8FA3BC";

  // ---------- Datos ----------
  const ts = k => +localStorage.getItem("almara-ts-" + k) || 0;
  const setTs = (k, v) => localStorage.setItem("almara-ts-" + k, String(v));
  function leer(k) {
    const [a, b] = CLAVES[k];
    const pa = JSON.parse(localStorage.getItem(a) || "null");
    return b ? { a: pa, b: JSON.parse(localStorage.getItem(b) || "null") } : pa;
  }
  function escribir(k, v) {
    const [a, b] = CLAVES[k];
    if (b) { if (v && v.a != null) localStorage.setItem(a, JSON.stringify(v.a)); if (v && v.b != null) localStorage.setItem(b, JSON.stringify(v.b)); }
    else if (v != null) localStorage.setItem(a, JSON.stringify(v));
  }
  const tim = {};
  // Llamar después de cada guardado local: sube a la nube 1,5 s después
  function marcar(k) {
    try { setTs(k, Date.now()); } catch (e) {}
    if (!configurado() || !sesion()) return;
    estado("Pendiente de guardar en la nube", PENDIENTE);
    clearTimeout(tim[k]); tim[k] = setTimeout(() => subir(k).catch(() => {}), 1500);
  }
  async function subir(k) {
    if (k === "empresa" && (esTecnico() || verComo())) return;
    const valor = leer(k); if (valor == null) return;
    const r = await pedir("/rest/v1/datos?on_conflict=user_id,clave", { method: "POST",
      headers: await cab({ "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify({ user_id: objetivo(), clave: k, valor, actualizado: new Date(ts(k) || Date.now()).toISOString() }) }, 20000);
    if (!r.ok) { estado(!activa() || r.status === 401 || r.status === 403 ? "Suscripción caducada: no se guardan los cambios" : "No se ha podido guardar en la nube", PENDIENTE); throw new Error(await r.text()); }
    estado("Guardado en la nube", OK);
  }
  // Compara móvil y nube y se queda con lo más reciente. Devuelve las claves que han cambiado en el móvil.
  async function sincronizar(claves) {
    claves = claves || Object.keys(CLAVES);
    if (!configurado() || !sesion()) return [];
    if (verComo()) claves = claves.filter(k => k !== "empresa");
    if (!claves.length) return [];
    const cambiadas = [];
    try {
      await cargarPerfil().catch(() => {});
      const tec = esTecnico(), yo = objetivo();
      // El técnico ve sus filas y la de empresa del administrador; el administrador filtra por la persona
      const r = await pedir("/rest/v1/datos?select=user_id,clave,valor,actualizado&clave=in.(" + claves.join(",") + ")" + (tec ? "" : "&user_id=eq." + yo), { headers: await cab() });
      if (!r.ok) throw new Error("HTTP " + r.status);
      const filas = await r.json(), rem = {};
      for (const f of filas) {
        if (tec && f.clave === "empresa") { if (f.user_id !== yo) rem.empresa = f; continue; }
        if (f.user_id && f.user_id !== yo) continue;
        rem[f.clave] = f;
      }
      if (!localStorage.getItem("almara-dueno")) localStorage.setItem("almara-dueno", sesion().user.id);
      for (const k of claves) {
        if (tec && k === "empresa") { // tarifas y datos de empresa: siempre los del administrador
          const f = rem.empresa;
          if (f && Date.parse(f.actualizado) !== ts(k)) { escribir(k, f.valor); setTs(k, Date.parse(f.actualizado)); cambiadas.push(k); }
          continue;
        }
        const loc = ts(k), f = rem[k], tr = f ? Date.parse(f.actualizado) : 0;
        if (f && tr > loc) { escribir(k, f.valor); setTs(k, tr); cambiadas.push(k); }
        else if (loc > tr && leer(k) != null) await subir(k);
      }
      estado("Sincronizado", OK);
    } catch (e) {
      if (e.auth) { requerir(); return []; }
      estado("Sin conexión: se guardará cuando vuelva", OFF);
    }
    return cambiadas;
  }

  // ---------- Fotos (Supabase Storage, carpeta privada del usuario) ----------
  const pend = () => { try { return JSON.parse(localStorage.getItem(PEND)) || []; } catch (e) { return []; } };
  const setPend = a => localStorage.setItem(PEND, JSON.stringify([...new Set(a)]));
  const ruta = id => `fotos/${objetivo()}/${encodeURIComponent(id)}.jpg`;
  async function subirFoto(id, blob) {
    if (!configurado() || !sesion()) return;
    try {
      const r = await pedir("/storage/v1/object/" + ruta(id), { method: "POST",
        headers: await cab({ "Content-Type": "image/jpeg", "x-upsert": "true" }), body: blob }, 60000);
      if (!r.ok) throw new Error("HTTP " + r.status);
      setPend(pend().filter(x => x !== id));
    } catch (e) { setPend(pend().concat(id)); }
  }
  async function bajarFoto(id) {
    if (!configurado() || !sesion()) return null;
    try {
      const r = await pedir("/storage/v1/object/authenticated/" + ruta(id), { headers: await cab() }, 60000);
      return r.ok ? await r.blob() : null;
    } catch (e) { return null; }
  }
  function borrarFoto(id) {
    if (!configurado() || !sesion()) return;
    cab().then(h => pedir("/storage/v1/object/" + ruta(id), { method: "DELETE", headers: h })).catch(() => {});
  }
  // Reintenta las fotos que no se pudieron subir (obtener(id) devuelve el blob local o null)
  async function reintentarFotos(obtener) {
    for (const id of pend()) { const b = await obtener(id).catch(() => null); if (b) await subirFoto(id, b); }
  }
  // Clientes guardados en este móvil (para enlazar planos y presupuestos)
  function clientes() { try { return (JSON.parse(localStorage.getItem("almara-clientes-v1")) || {}).clientes || []; } catch (e) { return []; } }

  // Peticiones directas a la base de datos (contactos, enlaces de presupuestos…)
  async function api(path, opt = {}) {
    if (!configurado() || !sesion()) throw new Error("Sin conexión con la nube");
    const r = await pedir("/rest/v1/" + path, { ...opt, headers: await cab({ "Content-Type": "application/json", ...(opt.headers || {}) }) }, 20000);
    if (!r.ok) throw new Error("HTTP " + r.status + " " + (await r.text()).slice(0, 200));
    const t = await r.text(); return t ? JSON.parse(t) : null;
  }
  // Funciones públicas (sin sesión), para la página que ve el cliente
  async function rpcPublica(fn, args) {
    const r = await pedir("/rest/v1/rpc/" + fn, { method: "POST", headers: { apikey: KEY, "Content-Type": "application/json" }, body: JSON.stringify(args) }, 15000);
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }
  return { perfil, cargarPerfil, esAdmin, esTecnico, sinEmpresa, deBaja, activa, diasPrueba, registrar, crearEmpresa, invitaciones, serie, ver, verComo, soloAdmin, equipo, datosEquipo, yo: () => sesion() && sesion().user.id,
    api, rpcPublica, configurado, sesion, entrar, salir, requerir, marcar, sincronizar, subirFoto, bajarFoto, borrarFoto, reintentarFotos,
    clientes, estado: () => est, CLAVES };
})();
