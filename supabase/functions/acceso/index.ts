// Borna · función «acceso»: guarda y retira el permiso de «Iniciar sesión con Apple».
// Apple obliga a retirar ese permiso cuando alguien borra su cuenta desde la app.
//   ?accion=apple    la app la llama justo después de entrar con Apple, con el código de un solo uso
//   ?accion=revocar  la app la llama al eliminar la cuenta (antes de borrarla)
// Secretos: SIWA_KEY (contenido del .p8 de «Sign in with Apple»), SIWA_KEY_ID, APNS_TEAM_ID o SIWA_TEAM_ID.
// Sin secretos responde {ok:false, motivo:"sin_clave"} y la app sigue (no bloquea nada).

const CABECERAS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const resp = (d: unknown, s = 200) => new Response(JSON.stringify(d), { status: s, headers: CABECERAS });
const BUNDLE = () => Deno.env.get("APPLE_BUNDLE_ID") || "group.almara.borna";
const SUPA = () => Deno.env.get("SUPABASE_URL") || "";

function b64url(datos: Uint8Array | string) {
  const b = typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  let s = ""; for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function claveSupabase() {
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); if (k && k.default) return k.default; } catch (_e) { /* sin claves nuevas */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

// client_secret para Apple: JWT ES256 firmado con la clave .p8 de «Sign in with Apple»
async function secretoApple(): Promise<string | null> {
  const pem = (Deno.env.get("SIWA_KEY") || "").replace(/-----[^-]+-----/g, "").replace(/\\n/g, "").replace(/\s/g, "");
  const kid = (Deno.env.get("SIWA_KEY_ID") || "").trim();
  const team = (Deno.env.get("SIWA_TEAM_ID") || Deno.env.get("APNS_TEAM_ID") || "").trim();
  if (!pem || !kid || !team) return null;
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const clave = await crypto.subtle.importKey("pkcs8", der, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ahora = Math.floor(Date.now() / 1000);
  const datos = b64url(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })) + "." +
    b64url(JSON.stringify({ iss: team, iat: ahora, exp: ahora + 600, aud: "https://appleid.apple.com", sub: BUNDLE() }));
  const firma = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, clave, new TextEncoder().encode(datos)));
  return datos + "." + b64url(firma);
}

async function usuario(req: Request): Promise<string | null> {
  const auth = req.headers.get("Authorization") || "";
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const r = await fetch(SUPA() + "/auth/v1/user", { headers: { Authorization: auth, apikey } });
  if (!r.ok) return null;
  const u = await r.json().catch(() => ({}));
  return u && u.id ? String(u.id) : null;
}

const rest = (ruta: string, opt: RequestInit = {}) => {
  const k = claveSupabase();
  return fetch(SUPA() + "/rest/v1/" + ruta, { ...opt, headers: { apikey: k, Authorization: "Bearer " + k, "Content-Type": "application/json", ...(opt.headers || {}) } });
};

async function guardar(uid: string, codigo: string) {
  const secreto = await secretoApple();
  if (!secreto) return resp({ ok: false, motivo: "sin_clave" });
  const r = await fetch("https://appleid.apple.com/auth/token", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: BUNDLE(), client_secret: secreto, code: codigo, grant_type: "authorization_code" }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.refresh_token) return resp({ ok: false, motivo: "apple", detalle: j.error || r.status });
  const g = await rest("apple_acceso?on_conflict=user_id", { method: "POST", headers: { Prefer: "resolution=merge-duplicates" },
    body: JSON.stringify({ user_id: uid, refresh_token: j.refresh_token, actualizado: new Date().toISOString() }) });
  return resp({ ok: g.ok });
}

async function revocar(uid: string) {
  const r = await rest("apple_acceso?select=refresh_token&user_id=eq." + uid);
  const filas = r.ok ? await r.json() : [];
  if (!filas.length) return resp({ ok: true, motivo: "sin_apple" });
  const secreto = await secretoApple();
  if (!secreto) return resp({ ok: false, motivo: "sin_clave" });
  const a = await fetch("https://appleid.apple.com/auth/revoke", { method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: BUNDLE(), client_secret: secreto, token: filas[0].refresh_token, token_type_hint: "refresh_token" }) });
  if (a.ok) await rest("apple_acceso?user_id=eq." + uid, { method: "DELETE" });
  return resp({ ok: a.ok });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CABECERAS });
  try {
    const uid = await usuario(req);
    if (!uid) return resp({ ok: false, motivo: "sin_sesion" }, 401);
    const accion = new URL(req.url).searchParams.get("accion");
    if (accion === "apple") {
      const c = await req.json().catch(() => ({}));
      if (!c.codigo) return resp({ ok: false, motivo: "sin_codigo" }, 400);
      return await guardar(uid, String(c.codigo));
    }
    if (accion === "revocar") return await revocar(uid);
    return resp({ ok: false, motivo: "accion" }, 400);
  } catch (e) {
    return resp({ ok: false, motivo: "error", detalle: String((e as Error).message || e) }, 500);
  }
});
