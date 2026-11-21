// Borna · activación automática de la suscripción cuando Stripe cobra.
// Función de Supabase (Edge Function) llamada "stripe". Stripe la avisa de cada pago y ella
// pone en la empresa la fecha hasta la que tiene acceso.
//
// Secretos que necesita (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      clave secreta de Stripe (sk_live_… o una restringida rk_live_… con escritura de suscripciones
//                          y del portal de clientes: al eliminar una cuenta se cancela su suscripción)
//   STRIPE_WEBHOOK_SECRET  secreto de firma del webhook de Stripe (whsec_…)
// Tiene que desplegarse con «Verify JWT» desactivado: quien la llama es Stripe, y se comprueba su firma.

const DIAS_DE_MARGEN = 2; // días extra de acceso por si un cobro se retrasa
const texto = new TextEncoder();
const json = (o, estado = 200) => new Response(JSON.stringify(o), { status: estado, headers: { "Content-Type": "application/json" } });
const id = (x) => (typeof x === "string" ? x : x && typeof x.id === "string" ? x.id : null);
const esUuid = (s) => typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

function iguales(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

// Comprueba que el aviso lo ha firmado Stripe (cabecera Stripe-Signature) y que es reciente
async function firmaValida(cuerpo, cabecera, secreto) {
  if (!cabecera || !secreto) return false;
  let t = "";
  const firmas = [];
  for (const parte of cabecera.split(",")) {
    const i = parte.indexOf("=");
    if (i < 0) continue;
    const k = parte.slice(0, i).trim(), v = parte.slice(i + 1).trim();
    if (k === "t") t = v; else if (k === "v1") firmas.push(v);
  }
  if (!/^\d+$/.test(t) || !firmas.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const clave = await crypto.subtle.importKey("raw", texto.encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", clave, texto.encode(t + "." + cuerpo)));
  const hex = Array.from(mac).map((b) => b.toString(16).padStart(2, "0")).join("");
  return firmas.some((f) => iguales(f, hex));
}

function claveSupabase() {
  try { const k = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}"); if (k && k.default) return k.default; } catch (_e) { /* sin claves nuevas */ }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}

async function manejar(req) {
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const cuerpo = await req.text();
  if (!(await firmaValida(cuerpo, req.headers.get("stripe-signature"), Deno.env.get("STRIPE_WEBHOOK_SECRET") || ""))) {
    return json({ error: "firma no válida" }, 400);
  }
  let ev;
  try { ev = JSON.parse(cuerpo); } catch (_e) { return json({ error: "cuerpo no válido" }, 400); }
  const o = (ev && ev.data && ev.data.object) || {};
  let suscripcion = null, cliente = null, empresa = null;
  switch (ev.type) {
    case "checkout.session.completed":
      if (o.mode !== "subscription") return json({ ok: true, ignorado: "no es una suscripción" });
      suscripcion = id(o.subscription); cliente = id(o.customer);
      empresa = esUuid(o.client_reference_id) ? o.client_reference_id : null;
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      suscripcion = id(o.subscription) ||
        id(o.parent && o.parent.subscription_details && o.parent.subscription_details.subscription);
      cliente = id(o.customer);
      break;
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      suscripcion = id(o); cliente = id(o.customer);
      break;
    default:
      return json({ ok: true, ignorado: ev.type });
  }
  if (!suscripcion) return json({ ok: true, ignorado: "sin suscripción" });

  // El estado real y la fecha se leen siempre de Stripe, no del aviso (los avisos pueden llegar desordenados)
  const rs = await fetch("https://api.stripe.com/v1/subscriptions/" + encodeURIComponent(suscripcion), {
    headers: { Authorization: "Bearer " + (Deno.env.get("STRIPE_SECRET_KEY") || "") },
  });
  let s: Record<string, unknown> = {};
  if (rs.status === 404) {
    s = { status: "canceled", ended_at: Math.floor(Date.now() / 1000) };
  } else if (!rs.ok) {
    return json({ error: "Stripe no responde: " + rs.status }, 500);
  } else {
    s = await rs.json();
  }
  let fin = typeof s.current_period_end === "number" ? s.current_period_end : 0;
  const items = (s.items as { data?: Array<{ current_period_end?: number }> } | undefined)?.data || [];
  for (const it of items) if (typeof it.current_period_end === "number" && it.current_period_end > fin) fin = it.current_period_end;
  const estado = typeof s.status === "string" ? s.status : "";
  const alCorriente = estado === "active" || estado === "trialing";
  let hasta: string | null = null;
  if (alCorriente && fin) hasta = new Date((fin + DIAS_DE_MARGEN * 86400) * 1000).toISOString();
  else if (estado === "canceled" || estado === "unpaid" || estado === "incomplete_expired") {
    const ended = typeof s.ended_at === "number" ? s.ended_at : Math.floor(Date.now() / 1000);
    hasta = new Date(ended * 1000).toISOString();
  }
  cliente = cliente || id(s.customer);

  const k = claveSupabase();
  const cab = { apikey: k, "Content-Type": "application/json" };
  if (!k.startsWith("sb_")) cab.Authorization = "Bearer " + k;
  const rp = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/rest/v1/rpc/registrar_pago", {
    method: "POST", headers: cab,
    body: JSON.stringify({ p_empresa: empresa, p_cliente: cliente, p_suscripcion: suscripcion, p_hasta: hasta, p_estado: estado || null }),
  });
  if (!rp.ok) return json({ error: "no se ha podido guardar: " + rp.status + " " + (await rp.text()).slice(0, 200) }, 500);
  const res = await rp.json();
  console.log("stripe", ev.type, suscripcion, estado, hasta, res);
  return json({ ok: true, resultado: res, hasta });
}

// Comprueba la sesión del administrador y devuelve el cliente de Stripe de su empresa (o una respuesta de error)
async function clienteDelAdmin(req: Request, salir: (o: unknown, estado?: number) => Response) {
  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return { error: salir({ error: "sin sesión" }, 401) };
  const supa = Deno.env.get("SUPABASE_URL") || "";
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const cabU = { apikey, Authorization: auth, "Content-Type": "application/json" };
  const ru = await fetch(supa + "/auth/v1/user", { headers: cabU });
  if (!ru.ok) return { error: salir({ error: "sesión no válida" }, 401) };
  const rp = await fetch(supa + "/rest/v1/rpc/mi_perfil", { method: "POST", headers: cabU, body: "{}" });
  if (!rp.ok) return { error: salir({ error: "no se ha podido leer el perfil" }, 401) };
  const perfil = await rp.json();
  if (!perfil || perfil.rol !== "admin" || !perfil.empresa_id) return { error: salir({ error: "solo el administrador" }, 403) };
  const re = await fetch(supa + "/rest/v1/empresas?select=stripe_cliente&id=eq." + perfil.empresa_id, { headers: cabU });
  if (!re.ok) return { error: salir({ error: "no se ha podido leer la empresa" }, 500) };
  const filas = await re.json();
  return { cliente: (filas && filas[0] && filas[0].stripe_cliente) || null };
}

const cabStripe = () => ({
  Authorization: "Bearer " + (Deno.env.get("STRIPE_SECRET_KEY") || ""),
  "Content-Type": "application/x-www-form-urlencoded",
});

function respuestaCors() {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  return (o: unknown, estado = 200) => new Response(JSON.stringify(o), { status: estado, headers: cors });
}

// Cancela al momento todas las suscripciones de la empresa. Se llama antes de eliminar la cuenta,
// para que a nadie se le siga cobrando después de borrar su empresa.
async function cancelar(req: Request) {
  const salir = respuestaCors();
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" } });
  if (req.method !== "POST") return salir({ error: "solo POST" }, 405);
  const r = await clienteDelAdmin(req, salir);
  if (r.error) return r.error;
  if (!r.cliente) return salir({ ok: true, canceladas: 0 });
  const rl = await fetch("https://api.stripe.com/v1/subscriptions?status=all&limit=100&customer=" + encodeURIComponent(r.cliente), { headers: cabStripe() });
  const l = await rl.json().catch(() => ({}));
  if (!rl.ok) return salir({ error: "Stripe no ha devuelto las suscripciones" }, 502);
  let n = 0;
  for (const s of l.data || []) {
    if (["canceled", "incomplete_expired"].includes(s.status)) continue;
    const rc = await fetch("https://api.stripe.com/v1/subscriptions/" + s.id, { method: "DELETE", headers: cabStripe() });
    if (!rc.ok) return salir({ error: "Stripe no ha cancelado la suscripción " + s.id }, 502);
    n++;
  }
  return salir({ ok: true, canceladas: n });
}

// Portal de cliente: lo abre el administrador ya identificado. No usa el enlace estático (estaba mal copiado).
async function portal(req: Request) {
  const cors = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
  };
  const salir = (o: unknown, estado = 200) => new Response(JSON.stringify(o), { status: estado, headers: cors });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return salir({ error: "solo POST" }, 405);
  const r = await clienteDelAdmin(req, salir);
  if (r.error) return r.error;
  const cliente = r.cliente;
  if (!cliente) return salir({ error: "sin_pago" }, 409);
  const vuelta = (Deno.env.get("APP_URL") || "https://instaladoresapp.vercel.app").replace(/\/+$/, "") + "/";
  const rs = await fetch("https://api.stripe.com/v1/billing_portal/sessions", {
    method: "POST",
    headers: cabStripe(),
    body: new URLSearchParams({ customer: cliente, return_url: vuelta }),
  });
  const s = await rs.json().catch(() => ({}));
  if (!rs.ok || !s.url) return salir({ error: "Stripe no ha abierto el portal" }, 502);
  return salir({ url: s.url });
}

Deno.serve((req) => {
  const accion = new URL(req.url).searchParams.get("accion");
  if (accion === "portal") return portal(req);
  if (accion === "cancelar") return cancelar(req);
  return manejar(req);
});
