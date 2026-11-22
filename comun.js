// En la app de iPhone/Android, Capacitor solo inyecta su puente nativo: la función registerPlugin()
// viene del paquete @capacitor/core, que esta web no carga. Sin ella no se podían usar los plugins
// propios (compra con Apple, avisos al móvil). Este apaño la define a partir del puente.
(function () {
  if (typeof window === "undefined") return;
  var C = window.Capacitor;
  if (!C || typeof C.registerPlugin === "function") return;
  C.registerPlugin = function (nombre) {
    var P = C.Plugins && C.Plugins[nombre];
    if (P) return P;
    return new Proxy({}, {
      get: function (_, metodo) {
        if (metodo === "then" || typeof metodo !== "string") return undefined;
        if (metodo === "addListener") {
          return function (evento, cb) {
            var id = C.nativeCallback(nombre, "addListener", { eventName: evento }, cb);
            return Promise.resolve({ remove: function () { return C.nativePromise(nombre, "removeListener", { callbackId: id, eventName: evento }); } });
          };
        }
        return function (opciones) { return C.nativePromise(nombre, metodo, opciones || {}); };
      }
    });
  };
})();

// Funciones puras compartidas (WhatsApp y fotos). También se prueban con Node.
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BornaUtil = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  // Número para wa.me. Un móvil español de 9 cifras lleva 34; si ya lo trae, no se duplica.
  function waNum(t) {
    let n = String(t || "").replace(/\D/g, "");
    if (n.startsWith("0034")) n = n.slice(2);
    if (n.startsWith("34") && n.length >= 11) return n;
    if (n.length === 9) return "34" + n;
    return n;
  }
  // Solo data URLs de PNG o JPEG. Cualquier otra cosa (un onerror, un javascript:) se descarta.
  function srcImagen(s) {
    if (typeof s !== "string") return "";
    const t = s.trim();
    if (t.length < 30 || t.length > 2500000) return "";
    if (!/^data:image\/(?:png|jpeg);base64,[a-z0-9+/=\s]+$/i.test(t)) return "";
    return t.replace(/\s/g, "");
  }
  return { waNum: waNum, srcImagen: srcImagen };
});
