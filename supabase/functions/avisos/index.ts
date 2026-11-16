// Avisos de la app instalada.
// Android: secreto FIREBASE_SERVICE_ACCOUNT (JSON de la cuenta de servicio).
// iPhone: secretos APNS_KEY (contenido del .p8), APNS_KEY_ID y APNS_TEAM_ID.
// La llama la base de datos, el formulario público y el botón de prueba.
const cors = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, estado = 200) => new Response(JSON.stringify(o), { status: estado, headers: cors });

function cabAdmin() {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const h: Record<string, string> = { apikey: k, "Content-Type": "application/json" };
  if (k && !k.startsWith("sb_")) h.Authorization = "Bearer " + k;
  return h;
}
async function rest(path: string, opt: RequestInit = {}) {
  const r = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/rest/v1/" + path, {
    ...opt, headers: { ...cabAdmin(), ...(opt.headers || {}) },
  });
  const t = await r.text();
  if (!r.ok) throw new Error(path.split("?")[0] + " " + r.status + " " + t.slice(0, 180));
  return t ? JSON.parse(t) : null;
}

function b64url(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function pemABinario(pem: string) {
  const limpio = pem.replace(/-----BEGIN [^-]+-----/, "").replace(/-----END [^-]+-----/, "").replace(/\s/g, "");
  const bin = atob(limpio);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function firmar(header: Record<string, string>, payload: Record<string, unknown>, key: CryptoKey, algo: Algorithm) {
  const datos = b64url(new TextEncoder().encode(JSON.stringify(header))) + "." + b64url(new TextEncoder().encode(JSON.stringify(payload)));
  const firma = new Uint8Array(await crypto.subtle.sign(algo, key, new TextEncoder().encode(datos)));
  return datos + "." + b64url(firma);
}

async function tokenGoogle(sa: { client_email: string; private_key: string }) {
  const key = await crypto.subtle.importKey("pkcs8", pemABinario(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const ahora = Math.floor(Date.now() / 1000);
  const assertion = await firmar(
    { alg: "RS256", typ: "JWT" },
    { iss: sa.client_email, scope: "https://www.googleapis.com/auth/firebase.messaging", aud: "https://oauth2.googleapis.com/token", iat: ahora, exp: ahora + 3600 },
    key, { name: "RSASSA-PKCS1-v1_5" },
  );
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error("Google no ha dado acceso");
  return j.access_token as string;
}

async function borrarMuertos(tokens: string[]) {
  for (const token of tokens) {
    await rest("dispositivos?token=eq." + encodeURIComponent(token), { method: "DELETE", headers: { Prefer: "return=minimal" } }).catch(() => {});
  }
}

async function enviarAndroid(tokens: string[], titulo: string, cuerpo: string, url: string) {
  const crudo = Deno.env.get("FIREBASE_SERVICE_ACCOUNT") || "";
  if (!tokens.length) return { enviados: 0, falta: "" };
  if (!crudo) return { enviados: 0, falta: "Android (Firebase)" };
  const sa = JSON.parse(crudo);
  const acceso = await tokenGoogle(sa);
  let enviados = 0;
  const muertos: string[] = [];
  for (const token of tokens) {
    const r = await fetch("https://fcm.googleapis.com/v1/projects/" + sa.project_id + "/messages:send", {
      method: "POST",
      headers: { Authorization: "Bearer " + acceso, "Content-Type": "application/json" },
      body: JSON.stringify({ message: {
        token, notification: { title: titulo, body: cuerpo }, data: { url },
        android: { priority: "HIGH", notification: { channel_id: "avisos", sound: "default" } },
      } }),
    });
    if (r.ok) enviados++;
    else {
      const e = await r.json().catch(() => ({}));
      const st = String(e.error && e.error.status || "");
      if (st === "NOT_FOUND" || st === "UNREGISTERED" || st === "INVALID_ARGUMENT") muertos.push(token);
    }
  }
  await borrarMuertos(muertos);
  return { enviados, falta: "" };
}

async function enviarIos(tokens: string[], titulo: string, cuerpo: string, url: string) {
  if (!tokens.length) return { enviados: 0, falta: "" };
  const pem = Deno.env.get("APNS_KEY") || "", kid = Deno.env.get("APNS_KEY_ID") || "", team = Deno.env.get("APNS_TEAM_ID") || "";
  if (!pem || !kid || !team) return { enviados: 0, falta: "iPhone (Apple)" };
  const key = await crypto.subtle.importKey("pkcs8", pemABinario(pem), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const ahora = Math.floor(Date.now() / 1000);
  const jwt = await firmar({ alg: "ES256", kid }, { iss: team, iat: ahora }, key, { name: "ECDSA", hash: "SHA-256" });
  const aviso = JSON.stringify({ aps: { alert: { title: titulo, body: cuerpo }, sound: "default" }, url });
  let enviados = 0;
  const muertos: string[] = [];
  for (const token of tokens) {
    let ok = false, muerto = false;
    for (const host of ["https://api.push.apple.com", "https://api.sandbox.push.apple.com"]) {
      const r = await fetch(host + "/3/device/" + token, {
        method: "POST",
        headers: { authorization: "bearer " + jwt, "apns-topic": "group.almara.borna", "apns-push-type": "alert", "apns-priority": "10" },
        body: aviso,
      });
      if (r.ok) { ok = true; break; }
      const e = await r.json().catch(() => ({}));
      if (e.reason === "Unregistered") { muerto = true; break; }
      if (e.reason === "BadDeviceToken") continue;
      break;
    }
    if (ok) enviados++;
    else if (muerto) muertos.push(token);
  }
  await borrarMuertos(muertos);
  return { enviados, falta: "" };
}

async function prefsDe(userId: string) {
  const rows = await rest("avisos_prefs?user_id=eq." + userId + "&select=contactos,presupuestos,visto");
  const r = rows && rows[0];
  return { contactos: r ? !!r.contactos : true, presupuestos: r ? !!r.presupuestos : true, visto: r ? !!r.visto : false };
}
async function mandar(userIds: string[], titulo: string, cuerpo: string, url: string) {
  const unicos = [...new Set(userIds)];
  if (!unicos.length) return { enviados: 0, dispositivos: 0, falta: "" };
  const equipo = await rest("equipo?select=user_id,rol&user_id=in.(" + unicos.join(",") + ")") || [];
  const vivos = equipo.filter((e: { rol: string }) => e.rol !== "baja").map((e: { user_id: string }) => e.user_id);
  if (!vivos.length) return { enviados: 0, dispositivos: 0, falta: "" };
  const lista = await rest("dispositivos?select=token,plataforma&user_id=in.(" + vivos.join(",") + ")") || [];
  const android = lista.filter((d: { plataforma: string }) => d.plataforma === "android").map((d: { token: string }) => d.token);
  const ios = lista.filter((d: { plataforma: string }) => d.plataforma === "ios").map((d: { token: string }) => d.token);
  const a = await enviarAndroid(android, titulo, cuerpo, url);
  const i = await enviarIos(ios, titulo, cuerpo, url);
  return { enviados: a.enviados + i.enviados, dispositivos: lista.length, falta: [a.falta, i.falta].filter(Boolean).join(" y ") };
}
async function tomar(path: string, body: Record<string, string>) {
  const rows = await rest(path, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
  return rows && rows[0];
}

async function tratar(req: Request) {
  if (req.method === "OPTIONS") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "solo POST" }, 405);
  const cuerpo = await req.json().catch(() => ({}));
  const tipo = String(cuerpo.tipo || "");
  const id = String(cuerpo.id || "");
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

  if (tipo === "prueba") {
    const auth = req.headers.get("authorization") || "";
    if (!auth.toLowerCase().startsWith("bearer ")) return json({ error: "sin sesión" }, 401);
    const apikey = req.headers.get("apikey") || Deno.env.get("SUPABASE_ANON_KEY") || "";
    const ru = await fetch((Deno.env.get("SUPABASE_URL") || "") + "/auth/v1/user", { headers: { apikey, Authorization: auth } });
    if (!ru.ok) return json({ error: "sesión no válida" }, 401);
    const u = await ru.json();
    const r = await mandar([u.id], "Borna", "Las notificaciones están activadas en este móvil.", "/");
    if (!r.dispositivos) return json({ ok: false, motivo: "sin_dispositivos" });
    if (!r.enviados && r.falta) return json({ ok: false, motivo: "sin_clave", falta: r.falta });
    return json({ ok: r.enviados > 0, enviados: r.enviados });
  }

  if (tipo === "contacto" && uuid) {
    const fila = await tomar("contactos?id=eq." + id + "&avisado_en=is.null", { avisado_en: new Date().toISOString() });
    if (!fila) return json({ ok: true, ya: true });
    const admins = await rest("equipo?select=user_id&empresa_id=eq." + fila.empresa_id + "&rol=eq.admin") || [];
    const dest: string[] = [];
    for (const a of admins) if ((await prefsDe(a.user_id)).contactos) dest.push(a.user_id);
    const quien = [fila.nombre, fila.servicio || fila.localidad].filter(Boolean).join(" · ");
    const r = await mandar(dest, "Nuevo contacto", quien || "Alguien ha escrito desde la web", "/contactos/");
    return json({ ok: true, enviados: r.enviados });
  }

  if ((tipo === "presupuesto" || tipo === "visto") && uuid) {
    const col = tipo === "visto" ? "aviso_visto" : "aviso_respuesta";
    const extra = tipo === "visto" ? "&visto=not.is.null" : "&estado=in.(aceptado,rechazado)";
    const fila = await tomar("presupuestos_publicos?token=eq." + id + "&" + col + "=is.null" + extra, { [col]: new Date().toISOString() });
    if (!fila) return json({ ok: true, ya: true });
    const dueno = await rest("equipo?select=empresa_id,rol&user_id=eq." + fila.user_id);
    const empresa = dueno && dueno[0] && dueno[0].empresa_id;
    const admins = empresa ? await rest("equipo?select=user_id&empresa_id=eq." + empresa + "&rol=eq.admin") || [] : [];
    const ids = new Set<string>();
    if (dueno && dueno[0] && dueno[0].rol !== "baja") ids.add(fila.user_id);
    for (const a of admins) ids.add(a.user_id);
    const dest: string[] = [];
    for (const uid of ids) {
      const pr = await prefsDe(uid);
      if (tipo === "visto" ? pr.visto : pr.presupuestos) dest.push(uid);
    }
    const cliente = fila.firma_nombre || (fila.datos && fila.datos.cliente && (fila.datos.cliente.nombre || fila.datos.cliente.contacto)) || "Un cliente";
    const titulo = tipo === "visto" ? "Han abierto un presupuesto" : (fila.estado === "aceptado" ? "Presupuesto aceptado" : "Presupuesto rechazado");
    const r = await mandar(dest, titulo, fila.numero + " · " + cliente, "/planos/?modo=pres");
    return json({ ok: true, enviados: r.enviados });
  }
  return json({ error: "tipo" }, 400);
}

Deno.serve(tratar);
