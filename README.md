# Borna

Clientes, planos, presupuestos, partes de trabajo y material para empresas instaladoras.
Cada empresa se da de alta sola, tiene sus propios datos y su propio equipo de técnicos.

## Puesta en marcha

1. **Supabase**: crea un proyecto NUEVO (no el de ALMARA). En *SQL Editor* pega entero `supabase.sql` y pulsa *Run*.
2. **Registro**: en *Authentication → Sign In / Providers → Email* deja activado el registro por correo
   y la confirmación de correo (*Confirm email*).
3. **config.js**: pega la *Project URL* y la *publishable key* del proyecto nuevo, y pon el nombre comercial en `producto`
   y tu contacto en `soporte`.
4. **Vercel**: importa este repositorio como proyecto nuevo. En Supabase, *Authentication → URL Configuration*,
   pon la dirección de Vercel como *Site URL*.

## Cómo funciona

- **Alta**: quien pulsa «Crear cuenta» y da de alta su empresa es su administrador. Empieza con 30 días de prueba.
- **Equipo**: el administrador añade compañeros con su correo; al crear su cuenta con ese correo entran en su empresa como técnicos.
- **Permisos** (los impone la base de datos): cada técnico ve solo lo suyo; el administrador ve lo de su equipo;
  nadie ve nada de otra empresa.
- **Formulario de contacto**: cada empresa tiene su enlace público (`/c/?e=…`) y recibe los mensajes en «Contactos web».
- **Fin de la prueba**: la empresa sigue viendo sus datos pero no puede guardar cambios. Para activarla:

  ```sql
  update public.empresas set pagado_hasta = now() + interval '1 year' where nombre = 'Nombre de la empresa';
  ```

## Cuenta y suscripción

- **Cuenta y suscripción** (en la portada): estado del plan, botón para suscribirse y eliminar la cuenta.
- En `config.js`: `precio` (texto), `pago` (enlace de pago de Stripe) y `portal` (portal de cliente de Stripe para cancelar).
  Mientras estén vacíos, la app pide escribir a `soporte`.
- **Eliminar la cuenta**: el administrador borra su cuenta y la empresa entera. A un técnico lo da de baja su administrador.

## Pendiente

- Activación automática al pagar (ahora se activa a mano con el `update` de arriba).
- Avisos al móvil (desactivados con `avisos: false` en `config.js`).
