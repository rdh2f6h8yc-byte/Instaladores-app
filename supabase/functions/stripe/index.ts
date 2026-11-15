// Borna · activación automática de la suscripción cuando Stripe cobra.
// Función de Supabase (Edge Function) llamada "stripe". Stripe la avisa de cada pago y ella
// pone en la empresa la fecha hasta la que tiene acceso.
//
// Secretos que necesita (Supabase → Edge Functions → Secrets):
//   STRIPE_SECRET_KEY      clave secreta de Stripe (sk_live_… o una restringida rk_live_… con lectura de suscripciones)
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
  if (!rs.ok) return json({ error: "Stripe no responde: " + rs.status }, 500);
  const s = await rs.json();
  let fin = typeof s.current_period_end === "number" ? s.current_period_end : 0;
  for (const it of (s.items && s.items.data) || []) if (typeof it.current_period_end === "number" && it.current_period_end > fin) fin = it.current_period_end;
  const alCorriente = s.status === "active" || s.status === "trialing";
  const hasta = alCorriente && fin ? new Date((fin + DIAS_DE_MARGEN * 86400) * 1000).toISOString() : null;
  cliente = cliente || id(s.customer);

  const k = claveSupabase();
  const cab = { apikey: k, "Content-Type": "application/json" };
  if (!k.startsWith("sb_")) cab.Authorization = "Bearer " + k;
  const rp = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/rest/v1/rpc/registrar_pago", {
    method: "POST", headers: cab,
    body: JSON.stringify({ p_empresa: empresa, p_cliente: cliente, p_suscripcion: suscripcion, p_hasta: hasta }),
  });
  if (!rp.ok) return json({ error: "no se ha podido guardar: " + rp.status + " " + (await rp.text()).slice(0, 200) }, 500);
  const res = await rp.json();
  console.log("stripe", ev.type, suscripcion, s.status, hasta, res);
  return json({ ok: true, resultado: res, hasta });
}

Deno.serve(manejar);
