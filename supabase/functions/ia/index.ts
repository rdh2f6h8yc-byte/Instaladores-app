// Borna · presupuesto con IA. Recibe lo que el instalador dicta o escribe, hasta 3 fotos de la obra
// y su tarifa, y devuelve las partidas del presupuesto. La app pone los precios de la tarifa;
// la IA solo propone precio para lo que no está en la tarifa (y la app lo marca para revisar).
//
// Secretos (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY   clave de la API de Claude (console.anthropic.com)
//   ANTHROPIC_MODEL     opcional; por defecto claude-sonnet-5-5
//   IA_MAX_DIA          opcional; presupuestos con IA por empresa y día (por defecto 40)
// Se despliega con «Verify JWT» ACTIVADO: solo la llaman usuarios con sesión.

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
const salir = (o: unknown, estado = 200) => new Response(JSON.stringify(o), { status: estado, headers: cors });

const HERRAMIENTA = {
  name: "crear_presupuesto",
  description: "Devuelve el presupuesto de la instalación en partidas.",
  input_schema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título corto del trabajo, p. ej. «Instalación de 4 cámaras en nave»" },
      partidas: {
        type: "array",
        items: {
          type: "object",
          properties: {
            tarifa_id: { type: "string", description: "id de la partida de la tarifa si encaja; cadena vacía si no está en la tarifa" },
            concepto: { type: "string" },
            descripcion: { type: "string", description: "Detalle breve para el cliente; puede ir vacío" },
            cantidad: { type: "number" },
            precio: { type: "number", description: "Solo si tarifa_id está vacío: precio unitario orientativo en euros SIN IVA en España. Si hay tarifa_id pon 0." },
          },
          required: ["tarifa_id", "concepto", "descripcion", "cantidad", "precio"],
        },
      },
      notas: { type: "array", items: { type: "string" }, description: "Condiciones del trabajo para el PDF (qué incluye o no incluye). Máximo 4." },
      dudas: { type: "array", items: { type: "string" }, description: "Cosas que el instalador debería confirmar antes de enviarlo. Máximo 4." },
    },
    required: ["titulo", "partidas", "notas", "dudas"],
  },
};

const SISTEMA = `Eres el ayudante de presupuestos de una empresa instaladora española (electricidad, redes, WiFi, cámaras, antenas, Starlink, telecomunicaciones).
El instalador te describe un trabajo (dictado por voz, puede tener errores de transcripción) y a veces añade fotos de la obra.
Tu trabajo: convertirlo en partidas de presupuesto realistas y llamar SIEMPRE a la herramienta crear_presupuesto, sin escribir texto aparte.

Reglas:
- Usa SIEMPRE las partidas de la tarifa del instalador cuando encajen, con su tarifa_id exacto. No cambies sus precios (pon precio 0).
- Si algo no está en la tarifa, añade una partida con tarifa_id vacío y un precio unitario orientativo de mercado en España, sin IVA. Sé prudente, no inflado.
- Cantidades: las que diga el instalador. Si no las dice, dedúcelas de las fotos o de lo habitual, y menciónalo en «dudas».
- Material: inclúyelo solo si el instalador lo pide o si es claramente necesario (cable, mecanismos, tubos) y está en la tarifa.
- No inventes datos del cliente (nombre, dirección, teléfono).
- Conceptos claros y profesionales, en español de España, sin abreviaturas raras.
- Si la descripción no es un trabajo de instalación, devuelve partidas vacías y explícalo en «dudas».`;

type Tarifa = { id: string; g?: string; c: string; d?: string; precio: number; ivaIncluido?: boolean };

function limpiarTarifa(t: unknown): Tarifa[] {
  if (!Array.isArray(t)) return [];
  return t.slice(0, 400).filter((x) => x && typeof x.id === "string" && typeof x.c === "string")
    .map((x) => ({ id: String(x.id).slice(0, 40), g: String(x.g || "").slice(0, 60), c: String(x.c).slice(0, 160),
      d: String(x.d || "").slice(0, 200), precio: Number(x.precio) || 0, ivaIncluido: !!x.ivaIncluido }));
}

function fotoValida(s: unknown): { tipo: string; datos: string } | null {
  if (typeof s !== "string" || s.length > 2_000_000) return null;
  const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(s);
  return m ? { tipo: m[1], datos: m[2] } : null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return salir({ error: "solo POST" }, 405);

  const auth = req.headers.get("authorization") || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return salir({ error: "Sin sesión" }, 401);
  const supa = Deno.env.get("SUPABASE_URL") || "";
  const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  const clave = Deno.env.get("ANTHROPIC_API_KEY") || "";
  if (!clave) return salir({ error: "Falta configurar la IA en el servidor (ANTHROPIC_API_KEY).", codigo: "sin_clave" }, 500);

  let cuerpo: Record<string, unknown>;
  try { cuerpo = await req.json(); } catch (_e) { return salir({ error: "Petición no válida" }, 400); }
  const texto = String(cuerpo.texto || "").trim().slice(0, 4000);
  const fotos = (Array.isArray(cuerpo.fotos) ? cuerpo.fotos : []).slice(0, 3).map(fotoValida).filter(Boolean) as { tipo: string; datos: string }[];
  const tarifa = limpiarTarifa(cuerpo.tarifa);
  if (!texto && !fotos.length) return salir({ error: "Describe el trabajo o añade una foto." }, 400);

  // Empresa activa y límite diario (con la sesión del usuario; la base de datos decide)
  const max = Math.max(1, Math.min(200, Number(Deno.env.get("IA_MAX_DIA")) || 40));
  const ru = await fetch(supa + "/rest/v1/rpc/usar_ia", {
    method: "POST", headers: { apikey, Authorization: auth, "Content-Type": "application/json" }, body: JSON.stringify({ p_max: max }),
  });
  if (!ru.ok) return salir({ error: "No se ha podido comprobar la cuenta (" + ru.status + "). ¿Has ejecutado el último supabase.sql?" }, 500);
  const permiso = await ru.json();
  if (permiso === "inactiva") return salir({ error: "Tu prueba o suscripción ha terminado.", codigo: "inactiva" }, 402);
  if (permiso === "limite") return salir({ error: `Has llegado al máximo de ${max} presupuestos con IA de hoy. Mañana vuelve a estar disponible.`, codigo: "limite" }, 429);
  if (permiso !== "ok") return salir({ error: "Tu cuenta no tiene empresa todavía.", codigo: permiso }, 403);

  const lineasTarifa = tarifa.map((t) => `${t.id} | ${t.g} | ${t.c}${t.d ? " (" + t.d + ")" : ""} | ${t.precio} €${t.ivaIncluido ? " IVA incl." : " sin IVA"}`).join("\n");
  const contenido: unknown[] = fotos.map((f) => ({ type: "image", source: { type: "base64", media_type: f.tipo, data: f.datos } }));
  contenido.push({
    type: "text",
    text: `TARIFA DEL INSTALADOR (id | grupo | concepto | precio):\n${lineasTarifa || "(sin tarifa)"}\n\n` +
      `CLIENTE: ${cuerpo.tipo === "empresa" ? "empresa" : "particular"}\n\n` +
      `TRABAJO DESCRITO POR EL INSTALADOR:\n${texto || "(sin texto, mira las fotos)"}\n\n` +
      `Responde únicamente llamando a la herramienta crear_presupuesto.`,
  });

  const ra = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": clave, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: 4000,
      system: SISTEMA,
      tools: [HERRAMIENTA],
      // Algunos modelos no admiten obligar a usar una herramienta: se pide en el mensaje y se deja en «auto»
      tool_choice: { type: "auto" },
      messages: [{ role: "user", content: contenido }],
    }),
  });
  const j = await ra.json().catch(() => ({}));
  if (!ra.ok) {
    console.log("anthropic", ra.status, JSON.stringify(j).slice(0, 500));
    const motivo = (j && j.error && j.error.message) ? ": " + String(j.error.message).slice(0, 160) : "";
    return salir({ error: "La IA no responde ahora mismo (" + ra.status + motivo + "). Inténtalo en un momento." }, 502);
  }
  const uso = (j.content || []).find((b: { type: string }) => b.type === "tool_use");
  const r = uso && uso.input;
  if (!r || !Array.isArray(r.partidas)) return salir({ error: "La IA no ha devuelto un presupuesto. Prueba a describirlo con más detalle." }, 502);

  const ids = new Set(tarifa.map((t) => t.id));
  const partidas = r.partidas.slice(0, 60).map((p: Record<string, unknown>) => {
    const id = typeof p.tarifa_id === "string" && ids.has(p.tarifa_id) ? p.tarifa_id : "";
    return {
      tarifa_id: id,
      concepto: String(p.concepto || "").slice(0, 160),
      descripcion: String(p.descripcion || "").slice(0, 300),
      cantidad: Math.max(0.01, Math.min(100000, Math.round((Number(p.cantidad) || 1) * 100) / 100)),
      precio: id ? 0 : Math.max(0, Math.min(1000000, Math.round((Number(p.precio) || 0) * 100) / 100)),
    };
  }).filter((p: { concepto: string; tarifa_id: string }) => p.concepto || p.tarifa_id);

  return salir({
    titulo: String(r.titulo || "").slice(0, 120),
    partidas,
    notas: (Array.isArray(r.notas) ? r.notas : []).slice(0, 4).map((n: unknown) => String(n).slice(0, 240)),
    dudas: (Array.isArray(r.dudas) ? r.dudas : []).slice(0, 4).map((n: unknown) => String(n).slice(0, 240)),
  });
});
