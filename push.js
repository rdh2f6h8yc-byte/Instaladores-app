// Notificaciones de la app instalada (App Store y Play Store). En el navegador no hace nada.
"use strict";
window.PushBorna = (() => {
  let plugin = null, token = "", escuchando = false;
  const nativa = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  function P() {
    if (!nativa()) return null;
    if (!plugin) plugin = window.Capacitor.registerPlugin("PushNotifications");
    return plugin;
  }
  function plataforma() { return window.Capacitor.getPlatform() === "ios" ? "ios" : "android"; }
  async function guardar(t) {
    token = t || "";
    if (!token || !window.Nube || !Nube.sesion()) return;
    await Nube.api("rpc/guardar_dispositivo", { method: "POST", body: JSON.stringify({ p_token: token, p_plataforma: plataforma() }) });
  }
  function escuchar() {
    const p = P(); if (!p || escuchando) return;
    escuchando = true;
    p.addListener("registration", ev => { guardar(ev.value).catch(() => {}); });
    p.addListener("registrationError", ev => { window.__pushError = (ev && ev.error) || "No se ha podido registrar el móvil"; });
    p.addListener("pushNotificationActionPerformed", ev => {
      const d = ev && ev.notification && ev.notification.data || {};
      const url = typeof d.url === "string" ? d.url : "/";
      if (url.startsWith("/") && !url.startsWith("//")) location.href = url;
    });
  }
  async function activar() {
    const p = P();
    if (!p) throw new Error("web");
    escuchar();
    if (p.createChannel) {
      await p.createChannel({ id: "avisos", name: "Avisos de Borna", description: "Contactos y presupuestos", importance: 5, visibility: 1, vibration: true }).catch(() => {});
    }
    let perm = await p.checkPermissions();
    if (perm.receive !== "granted") perm = await p.requestPermissions();
    if (perm.receive !== "granted") throw new Error("denegado");
    window.__pushError = "";
    await p.register();
    return true;
  }
  async function concedido() {
    const p = P(); if (!p) return false;
    try { const perm = await p.checkPermissions(); return perm.receive === "granted"; } catch (e) { return false; }
  }
  async function soltar() {
    if (!token || !window.Nube || !Nube.sesion()) return;
    const t = token; token = "";
    await Nube.api("rpc/quitar_dispositivo", { method: "POST", body: JSON.stringify({ p_token: t }) }).catch(() => {});
  }
  // Si ya dio permiso, renueva el registro al entrar (el token puede cambiar)
  async function alEntrar() {
    if (!nativa() || !window.Nube || !Nube.sesion()) return;
    escuchar();
    if (await concedido()) activar().catch(() => {});
  }
  return { nativa, activar, concedido, soltar, alEntrar, token: () => token };
})();
