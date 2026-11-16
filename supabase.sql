-- APP PARA INSTALADORES · base de datos para varias empresas
-- Proyecto NUEVO de Supabase: pegar entero en SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.

-- =====================================================================
-- 1) EMPRESAS, EQUIPO E INVITACIONES
-- =====================================================================
create table if not exists public.empresas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  creado timestamptz not null default now(),
  -- Acceso: 30 días de prueba; después hace falta pagado_hasta en el futuro
  prueba_hasta timestamptz not null default now() + interval '30 days',
  pagado_hasta timestamptz
);

create table if not exists public.equipo (
  user_id uuid primary key references auth.users(id) on delete cascade,
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  email text not null,
  nombre text not null check (char_length(nombre) between 1 and 80),
  rol text not null default 'tecnico' check (rol in ('admin','tecnico','baja')),
  serie text not null default '' check (serie ~ '^[A-Z]{0,3}$'),
  creado timestamptz not null default now()
);
create index if not exists equipo_empresa on public.equipo (empresa_id);
create unique index if not exists equipo_serie on public.equipo (empresa_id, serie) where serie <> '';

-- Compañeros invitados que todavía no se han registrado
create table if not exists public.invitaciones (
  email text primary key check (email = lower(email)),
  empresa_id uuid not null references public.empresas(id) on delete cascade,
  nombre text not null check (char_length(nombre) between 1 and 80),
  serie text not null check (serie ~ '^[A-Z]{1,3}$'),
  creado timestamptz not null default now()
);

-- =====================================================================
-- 2) FUNCIONES DE APOYO (las usan las reglas de seguridad)
-- =====================================================================
create or replace function public.mi_empresa() returns uuid
language sql stable security definer set search_path = public as $$
  select empresa_id from public.equipo where user_id = auth.uid() and rol <> 'baja'
$$;

create or replace function public.soy_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipo where user_id = auth.uid() and rol = 'admin')
$$;

-- ¿Ese usuario es de mi empresa?
create or replace function public.mismo_equipo(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipo where user_id = u and empresa_id = public.mi_empresa())
$$;

-- ¿Soy el administrador de la empresa de ese usuario?
create or replace function public.es_admin_de(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.soy_admin() and public.mismo_equipo(u)
$$;

-- ¿Ese usuario es el administrador de mi empresa?
create or replace function public.es_mi_admin(u uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.equipo
                  where user_id = u and rol = 'admin' and empresa_id = public.mi_empresa())
$$;

-- ¿Mi empresa está en prueba o al corriente de pago?
create or replace function public.empresa_activa() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.empresas e
                  where e.id = public.mi_empresa()
                    and greatest(e.prueba_hasta, coalesce(e.pagado_hasta, e.prueba_hasta)) > now())
$$;

create or replace function public.existe_empresa(e uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.empresas where id = e)
$$;

-- Carpeta de fotos: la mía, o la de un técnico de mi empresa si soy el administrador
create or replace function public.carpeta_permitida(c text) returns boolean
language sql stable security definer set search_path = public as $$
  select case
    when c is null then false
    when c = auth.uid()::text then public.mi_empresa() is not null
    when c ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.es_admin_de(c::uuid)
    else false
  end
$$;

-- =====================================================================
-- 3) REGLAS DE EMPRESAS, EQUIPO E INVITACIONES (solo lectura; se cambia con funciones)
-- =====================================================================
alter table public.empresas enable row level security;
alter table public.equipo enable row level security;
alter table public.invitaciones enable row level security;

drop policy if exists "mi empresa" on public.empresas;
create policy "mi empresa" on public.empresas for select to authenticated
  using (id = public.mi_empresa());

drop policy if exists "mi ficha o mi equipo" on public.equipo;
create policy "mi ficha o mi equipo" on public.equipo for select to authenticated
  using (user_id = auth.uid() or (public.soy_admin() and empresa_id = public.mi_empresa()));

drop policy if exists "invitaciones de mi empresa" on public.invitaciones;
create policy "invitaciones de mi empresa" on public.invitaciones for select to authenticated
  using (public.soy_admin() and empresa_id = public.mi_empresa());

-- =====================================================================
-- 4) DATOS (clientes, planos, presupuestos, material y datos de empresa)
-- =====================================================================
create table if not exists public.datos (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  clave text not null check (clave in ('clientes','planos','presupuestos','empresa','material')),
  valor jsonb not null,
  actualizado timestamptz not null default now(),
  primary key (user_id, clave)
);
alter table public.datos enable row level security;

drop policy if exists "leer datos" on public.datos;
drop policy if exists "crear datos" on public.datos;
drop policy if exists "cambiar datos" on public.datos;
drop policy if exists "borrar datos" on public.datos;

-- Leer: lo mío; el administrador, lo de su equipo; el técnico, además, los datos y tarifas de la empresa
create policy "leer datos" on public.datos for select to authenticated using (
  (user_id = auth.uid() and public.mi_empresa() is not null)
  or public.es_admin_de(user_id)
  or (clave = 'empresa' and public.es_mi_admin(user_id))
);
-- Escribir: lo mismo, con la empresa activa; los datos de empresa solo los toca el administrador
create policy "crear datos" on public.datos for insert to authenticated with check (
  public.empresa_activa()
  and ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id))
  and (clave <> 'empresa' or (public.soy_admin() and user_id = auth.uid()))
);
create policy "cambiar datos" on public.datos for update to authenticated using (
  (user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id)
) with check (
  public.empresa_activa()
  and ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id))
  and (clave <> 'empresa' or (public.soy_admin() and user_id = auth.uid()))
);
create policy "borrar datos" on public.datos for delete to authenticated using (
  (user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id)
);

-- =====================================================================
-- 5) FOTOS (carpeta privada por usuario)
-- =====================================================================
insert into storage.buckets (id, name, public) values ('fotos', 'fotos', false)
  on conflict (id) do nothing;
drop policy if exists "fotos leer" on storage.objects;
drop policy if exists "fotos subir" on storage.objects;
drop policy if exists "fotos cambiar" on storage.objects;
drop policy if exists "fotos borrar" on storage.objects;
create policy "fotos leer" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and public.carpeta_permitida((storage.foldername(name))[1]));
create policy "fotos subir" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and public.empresa_activa() and public.carpeta_permitida((storage.foldername(name))[1]));
create policy "fotos cambiar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and public.empresa_activa() and public.carpeta_permitida((storage.foldername(name))[1]));
create policy "fotos borrar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and public.carpeta_permitida((storage.foldername(name))[1]));

-- =====================================================================
-- 6) CONTACTOS (formulario público de cada empresa)
-- =====================================================================
create table if not exists public.contactos (
  id uuid primary key default gen_random_uuid(),
  empresa_id uuid not null default public.mi_empresa() references public.empresas(id) on delete cascade,
  creado timestamptz not null default now(),
  nombre text not null check (char_length(nombre) between 1 and 120),
  telefono text check (char_length(telefono) <= 40),
  email text check (char_length(email) <= 160),
  localidad text check (char_length(localidad) <= 120),
  servicio text check (char_length(servicio) <= 80),
  mensaje text check (char_length(mensaje) <= 2000),
  origen text check (char_length(origen) <= 300),
  estado text not null default 'nuevo' check (estado in ('nuevo','contactado','cliente','descartado'))
);
create index if not exists contactos_empresa on public.contactos (empresa_id, creado desc);
alter table public.contactos enable row level security;
drop policy if exists "cualquiera puede enviar" on public.contactos;
drop policy if exists "los gestiona el administrador" on public.contactos;
-- Cualquiera puede ENVIAR un contacto a una empresa que exista (no leerlo)
create policy "cualquiera puede enviar" on public.contactos for insert to anon, authenticated
  with check (estado = 'nuevo' and public.existe_empresa(empresa_id));
-- Solo el administrador de ESA empresa los ve y los cambia
create policy "los gestiona el administrador" on public.contactos for all to authenticated
  using (public.soy_admin() and empresa_id = public.mi_empresa())
  with check (public.soy_admin() and empresa_id = public.mi_empresa());

-- Nombre de la empresa para la cabecera del formulario público
create or replace function public.nombre_empresa(p_empresa uuid) returns text
language sql stable security definer set search_path = public as $$
  select nombre from public.empresas where id = p_empresa
$$;

-- =====================================================================
-- 7) PRESUPUESTOS ENVIADOS POR ENLACE
-- =====================================================================
create table if not exists public.presupuestos_publicos (
  token uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  numero text not null,
  datos jsonb not null,
  estado text not null default 'enviado' check (estado in ('enviado','aceptado','rechazado')),
  creado timestamptz not null default now(),
  visto timestamptz,
  respondido timestamptz,
  firma_nombre text,
  firma_dni text,
  firma_png text,
  comentario text
);
alter table public.presupuestos_publicos enable row level security;
drop policy if exists "leer enlaces" on public.presupuestos_publicos;
drop policy if exists "crear enlaces" on public.presupuestos_publicos;
drop policy if exists "cambiar enlaces" on public.presupuestos_publicos;
drop policy if exists "borrar enlaces" on public.presupuestos_publicos;
create policy "leer enlaces" on public.presupuestos_publicos for select to authenticated
  using ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id));
create policy "crear enlaces" on public.presupuestos_publicos for insert to authenticated
  with check (public.empresa_activa() and ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id)));
create policy "cambiar enlaces" on public.presupuestos_publicos for update to authenticated
  using ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id))
  with check (public.empresa_activa() and ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id)));
create policy "borrar enlaces" on public.presupuestos_publicos for delete to authenticated
  using ((user_id = auth.uid() and public.mi_empresa() is not null) or public.es_admin_de(user_id));

-- El cliente solo puede VER su presupuesto con el código del enlace…
create or replace function public.ver_presupuesto(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare r public.presupuestos_publicos;
begin
  select * into r from public.presupuestos_publicos where token = p_token;
  if not found then return null; end if;
  update public.presupuestos_publicos set visto = coalesce(visto, now()) where token = p_token;
  return jsonb_build_object('numero', r.numero, 'datos', r.datos, 'estado', r.estado,
    'respondido', r.respondido, 'firma_nombre', r.firma_nombre);
end $$;

-- …y aceptarlo (con firma) o rechazarlo, una sola vez. La firma tiene que ser un PNG real.
create or replace function public.responder_presupuesto(p_token uuid, p_acepta boolean, p_nombre text, p_dni text, p_firma text, p_comentario text) returns text
language plpgsql security definer set search_path = public as $$
declare r public.presupuestos_publicos; v_hasta text;
begin
  select * into r from public.presupuestos_publicos where token = p_token;
  if not found or r.estado <> 'enviado' then return 'ya_respondido'; end if;
  v_hasta := r.datos->>'validoHasta';
  if v_hasta ~ '^\d{4}-\d{2}-\d{2}$' and (v_hasta || 'T23:59:59Z')::timestamptz < now() then
    return 'caducado';
  end if;
  if p_acepta and (p_firma is null or p_firma !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$'
      or length(p_firma) < 100 or length(p_firma) > 400000) then
    raise exception 'Falta la firma';
  end if;
  update public.presupuestos_publicos
     set estado = case when p_acepta then 'aceptado' else 'rechazado' end,
         respondido = now(), firma_nombre = left(p_nombre, 120), firma_dni = left(p_dni, 30),
         firma_png = case when p_acepta then p_firma end, comentario = left(p_comentario, 1000)
   where token = p_token and estado = 'enviado';
  if not found then return 'ya_respondido'; end if;
  return 'ok';
end $$;

-- =====================================================================
-- 8) ALTA DE EMPRESA, PERFIL Y EQUIPO
-- =====================================================================
-- Quién soy. Una invitación no mete a nadie en la empresa hasta que la acepte.
create or replace function public.mi_perfil() returns jsonb
language plpgsql security definer set search_path = public as $$
declare q public.equipo; e public.empresas; i public.invitaciones; v_email text; v_emp text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into q from public.equipo where user_id = auth.uid();
  if q.user_id is null then
    select lower(u.email) into v_email from auth.users u
     where u.id = auth.uid() and u.email_confirmed_at is not null;
    if v_email is not null then
      select * into i from public.invitaciones where email = v_email;
    end if;
    if i.email is not null then
      select nombre into v_emp from public.empresas where id = i.empresa_id;
      return jsonb_build_object('user_id', auth.uid(), 'rol', 'sin_empresa', 'nombre', '', 'serie', '',
        'invitacion', jsonb_build_object('empresa_id', i.empresa_id, 'empresa', v_emp, 'nombre', i.nombre, 'serie', i.serie));
    end if;
    return jsonb_build_object('user_id', auth.uid(), 'rol', 'sin_empresa', 'nombre', '', 'serie', '');
  end if;
  select * into e from public.empresas where id = q.empresa_id;
  return jsonb_build_object('user_id', q.user_id, 'rol', q.rol, 'nombre', q.nombre, 'serie', q.serie,
    'empresa_id', e.id, 'empresa', e.nombre, 'prueba_hasta', e.prueba_hasta, 'pagado_hasta', e.pagado_hasta,
    'activa', greatest(e.prueba_hasta, coalesce(e.pagado_hasta, e.prueba_hasta)) > now());
end $$;

-- Dar de alta mi empresa (quien la crea es el administrador)
create or replace function public.crear_empresa(p_empresa text, p_nombre text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_email text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if exists (select 1 from public.equipo where user_id = auth.uid()) then return 'ya_tienes'; end if;
  if char_length(btrim(coalesce(p_empresa, ''))) = 0 then return 'falta_empresa'; end if;
  if char_length(btrim(coalesce(p_nombre, ''))) = 0 then return 'falta_nombre'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  -- Si tenía una invitación y prefiere crear su propia empresa, la invitación se descarta
  delete from public.invitaciones where email = v_email;
  insert into public.empresas (nombre) values (left(btrim(p_empresa), 120)) returning id into v_id;
  insert into public.equipo (user_id, empresa_id, email, nombre, rol, serie)
    values (auth.uid(), v_id, coalesce(v_email, ''), left(btrim(p_nombre), 80), 'admin', '');
  return 'ok';
end $$;

-- Añadir a un compañero. Si ya está en la empresa se actualiza; si no, queda invitado hasta que acepte.
create or replace function public.guardar_tecnico(p_email text, p_nombre text, p_serie text) returns text
language plpgsql security definer set search_path = public as $$
declare v_emp uuid := public.mi_empresa(); v_email text := lower(btrim(coalesce(p_email, '')));
        v_serie text := upper(btrim(coalesce(p_serie, ''))); v_nombre text := left(btrim(coalesce(p_nombre, '')), 80);
        v_user uuid; q public.equipo;
begin
  if v_emp is null or not public.soy_admin() then raise exception 'Solo el administrador'; end if;
  if not public.empresa_activa() then return 'caducada'; end if;
  if v_serie = '' then return 'falta_serie'; end if;
  if v_serie !~ '^[A-Z]{1,3}$' or v_nombre = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'datos_mal'; end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user = auth.uid() then return 'eres_tu'; end if;
  if exists (select 1 from public.equipo where empresa_id = v_emp and serie = v_serie and user_id is distinct from v_user)
     or exists (select 1 from public.invitaciones where empresa_id = v_emp and serie = v_serie and email <> v_email) then
    return 'serie_repetida';
  end if;
  if v_user is not null then
    select * into q from public.equipo where user_id = v_user;
    if found then
      if q.empresa_id <> v_emp then return 'otra_empresa'; end if;
      update public.equipo set nombre = v_nombre, serie = v_serie where user_id = v_user;
      delete from public.invitaciones where email = v_email and empresa_id = v_emp;
      return 'ok';
    end if;
  end if;
  if exists (select 1 from public.invitaciones where email = v_email and empresa_id <> v_emp) then return 'otra_empresa'; end if;
  insert into public.invitaciones (email, empresa_id, nombre, serie) values (v_email, v_emp, v_nombre, v_serie)
    on conflict (email) do update set empresa_id = excluded.empresa_id, nombre = excluded.nombre, serie = excluded.serie;
  return 'invitado';
end $$;

create or replace function public.quitar_invitacion(p_email text) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.soy_admin() then raise exception 'Solo el administrador'; end if;
  delete from public.invitaciones where email = lower(btrim(p_email)) and empresa_id = public.mi_empresa();
  return 'ok';
end $$;

-- El invitado entra en la empresa solo si pulsa Aceptar
create or replace function public.aceptar_invitacion() returns text
language plpgsql security definer set search_path = public as $$
declare i public.invitaciones; v_email text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  if exists (select 1 from public.equipo where user_id = auth.uid()) then return 'ya_tienes'; end if;
  select lower(u.email) into v_email from auth.users u
   where u.id = auth.uid() and u.email_confirmed_at is not null;
  if v_email is null then return 'sin_confirmar'; end if;
  select * into i from public.invitaciones where email = v_email;
  if not found then return 'sin_invitacion'; end if;
  insert into public.equipo (user_id, empresa_id, email, nombre, rol, serie)
    values (auth.uid(), i.empresa_id, v_email, i.nombre, 'tecnico', i.serie);
  delete from public.invitaciones where email = v_email;
  return 'ok';
end $$;

create or replace function public.rechazar_invitacion() returns text
language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select lower(email) into v_email from auth.users where id = auth.uid();
  delete from public.invitaciones where email = v_email;
  return 'ok';
end $$;

-- Dar de baja o reactivar a un técnico (sus datos se quedan en la empresa)
create or replace function public.cambiar_estado_tecnico(p_user uuid, p_activo boolean) returns text
language plpgsql security definer set search_path = public as $$
begin
  if not public.soy_admin() then raise exception 'Solo el administrador'; end if;
  update public.equipo set rol = case when p_activo then 'tecnico' else 'baja' end
   where user_id = p_user and user_id <> auth.uid() and rol <> 'admin' and empresa_id = public.mi_empresa();
  if not found then return 'no_existe'; end if;
  return 'ok';
end $$;

-- Eliminar la cuenta para siempre. El administrador elimina además la empresa entera
-- (datos, fotos y cuentas de todo el equipo). Un técnico no puede: lo da de baja su administrador.
create or replace function public.eliminar_cuenta() returns text
language plpgsql security definer set search_path = public as $$
declare q public.equipo; v_ids uuid[];
begin
  if auth.uid() is null then raise exception 'Sin sesión'; end if;
  select * into q from public.equipo where user_id = auth.uid();
  if found then
    if q.rol <> 'admin' then return 'solo_admin'; end if;
    select coalesce(array_agg(user_id), '{}') into v_ids from public.equipo where empresa_id = q.empresa_id;
    delete from storage.objects
     where bucket_id = 'fotos'
       and (storage.foldername(name))[1] in (select x::text from unnest(v_ids) as x);
    delete from public.datos where user_id = any (v_ids);
    delete from public.presupuestos_publicos where user_id = any (v_ids);
    delete from public.empresas where id = q.empresa_id;
    delete from auth.users where id = any (v_ids);
    return 'ok';
  end if;
  delete from auth.users where id = auth.uid();
  return 'ok';
end $$;

-- Suscripción de pago (Stripe). La función «stripe» llama a registrar_pago.
-- Con la suscripción activa alarga la fecha. Si Stripe la da por terminada, la recorta a ese día.
alter table public.empresas add column if not exists stripe_cliente text;
alter table public.empresas add column if not exists stripe_suscripcion text;

drop function if exists public.registrar_pago(uuid, text, text, timestamptz);
drop function if exists public.registrar_pago(uuid, text, text, timestamptz, text);

create or replace function public.registrar_pago(p_empresa uuid, p_cliente text, p_suscripcion text, p_hasta timestamptz, p_estado text) returns text
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if p_empresa is not null then select id into v_id from public.empresas where id = p_empresa; end if;
  if v_id is null and p_suscripcion is not null then
    select id into v_id from public.empresas where stripe_suscripcion = p_suscripcion limit 1; end if;
  if v_id is null and p_cliente is not null then
    select id into v_id from public.empresas where stripe_cliente = p_cliente limit 1; end if;
  if v_id is null then return 'sin_empresa'; end if;
  update public.empresas
     set stripe_cliente = coalesce(p_cliente, stripe_cliente),
         stripe_suscripcion = coalesce(p_suscripcion, stripe_suscripcion),
         pagado_hasta = case
           when p_estado in ('active', 'trialing') and p_hasta is not null
             then greatest(coalesce(pagado_hasta, p_hasta), p_hasta)
           when p_estado in ('canceled', 'unpaid', 'incomplete_expired')
             then least(coalesce(pagado_hasta, coalesce(p_hasta, now())), coalesce(p_hasta, now()))
           else pagado_hasta
         end
   where id = v_id;
  return 'ok';
end $$;

-- =====================================================================
-- 9) PERMISOS
-- =====================================================================
grant usage on schema public to anon, authenticated;
grant select on public.empresas, public.equipo, public.invitaciones to authenticated;
grant select, insert, update, delete on public.datos, public.presupuestos_publicos, public.contactos to authenticated;
grant insert on public.contactos to anon;

revoke all on function public.mi_perfil() from public, anon;
revoke all on function public.crear_empresa(text, text) from public, anon;
revoke all on function public.guardar_tecnico(text, text, text) from public, anon;
revoke all on function public.quitar_invitacion(text) from public, anon;
revoke all on function public.aceptar_invitacion() from public, anon;
revoke all on function public.rechazar_invitacion() from public, anon;
revoke all on function public.cambiar_estado_tecnico(uuid, boolean) from public, anon;
grant execute on function public.mi_perfil(), public.crear_empresa(text, text), public.guardar_tecnico(text, text, text),
  public.quitar_invitacion(text), public.aceptar_invitacion(), public.rechazar_invitacion(),
  public.cambiar_estado_tecnico(uuid, boolean) to authenticated;

revoke all on function public.eliminar_cuenta() from public, anon;
grant execute on function public.eliminar_cuenta() to authenticated;

-- Solo la puede llamar el servidor (la función «stripe»), nunca un usuario de la app
revoke all on function public.registrar_pago(uuid, text, text, timestamptz, text) from public, anon, authenticated;
grant execute on function public.registrar_pago(uuid, text, text, timestamptz, text) to service_role;

revoke all on function public.ver_presupuesto(uuid) from public;
revoke all on function public.responder_presupuesto(uuid, boolean, text, text, text, text) from public;
grant execute on function public.ver_presupuesto(uuid), public.responder_presupuesto(uuid, boolean, text, text, text, text),
  public.nombre_empresa(uuid), public.existe_empresa(uuid) to anon, authenticated;
grant execute on function public.mi_empresa(), public.soy_admin(), public.mismo_equipo(uuid), public.es_admin_de(uuid),
  public.es_mi_admin(uuid), public.empresa_activa(), public.carpeta_permitida(text) to authenticated;

-- =====================================================================
-- CÓMO ACTIVAR A UNA EMPRESA QUE HA PAGADO (hasta que el cobro sea automático)
--   update public.empresas set pagado_hasta = now() + interval '1 year' where nombre = 'Nombre de la empresa';
-- =====================================================================
