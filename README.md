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

- **Alta**: quien pulsa «Crear cuenta» y da de alta su empresa es su administrador. Empieza con 7 días de prueba.
- **Equipo**: el administrador invita a un compañero con su correo. Esa persona crea la cuenta (o entra, si ya la tiene) y acepta la invitación. Hasta entonces no ve nada de la empresa.
- **Permisos** (los impone la base de datos): cada técnico ve solo lo suyo; el administrador ve lo de su equipo;
  nadie ve nada de otra empresa.
- **Formulario de contacto**: cada empresa tiene su enlace público (`/c/?e=…`) y recibe los mensajes en «Contactos web».
- **Fin de la prueba**: la empresa sigue viendo sus datos pero no puede guardar cambios. Para activarla:

  ```sql
  update public.empresas set pagado_hasta = now() + interval '1 year' where nombre = 'Nombre de la empresa';
  ```

## Cuenta y suscripción

- **Cuenta y suscripción** (en la portada): estado del plan, botón para suscribirse y eliminar la cuenta.
- En `config.js`: `precioMensual` y `precioAnual` (textos), `pagoMensual` y `pagoAnual` (enlaces de pago de Stripe) y `portal` (portal de cliente de Stripe para cancelar).
  Mientras estén vacíos, la app pide escribir a `soporte`.
- **Eliminar la cuenta**: el administrador borra su cuenta y la empresa entera. A un técnico lo da de baja su administrador.

## Activación automática al pagar

La función `supabase/functions/stripe/index.ts` recibe los avisos de Stripe y pone a cada empresa la fecha
hasta la que tiene acceso (fin del periodo pagado más 2 días de margen). Nunca acorta una fecha.

1. Ejecuta otra vez `supabase.sql` (crea `registrar_pago` y el resto de reglas).
   Si ya lo habías ejecutado, vuelve a pegarlo entero: se puede lanzar más de una vez.
2. Supabase → **Edge Functions** → crea o actualiza la función llamada `stripe`, pega el contenido de
   `supabase/functions/stripe/index.ts` y despliégala con **Verify JWT desactivado**.
3. Supabase → Edge Functions → **Secrets**: añade `STRIPE_SECRET_KEY` (clave secreta de Stripe) y,
   después del paso 4, `STRIPE_WEBHOOK_SECRET`.
4. Stripe → Desarrolladores → **Webhooks** → añade el destino
   `https://<tu-proyecto>.supabase.co/functions/v1/stripe` con los eventos `checkout.session.completed`,
   `invoice.paid`, `customer.subscription.updated` y `customer.subscription.deleted`.
   Copia su secreto de firma (`whsec_…`) al secreto `STRIPE_WEBHOOK_SECRET`.
5. Stripe → **Ajustes → Portal de clientes** → actívalo (cambiar tarjeta, facturas y cancelar).
   El botón de la app abre ese portal con la sesión del administrador. No hace falta pegar ningún enlace.

Si usas una clave restringida (`rk_…`), necesita permiso de **escritura** en suscripciones y en el portal de clientes:
al eliminar una cuenta, la función cancela su suscripción antes de borrar nada.

Las claves `sk_…` y `whsec_…` no se guardan nunca en este repositorio.
Si alguien paga sin pasar por la app (sin la referencia de su empresa), hay que activarlo a mano.

Una suscripción activa alarga el acceso hasta el fin del periodo más 2 días. Si se cancela al momento
o queda impagada, el acceso se cierra ese día. Si se cancela al final del periodo, sigue hasta entonces.

## Equipo

El administrador invita por correo. La persona entra con ese correo y tiene que pulsar **Aceptar**.
Hasta entonces no ve los datos de la empresa y puede crear la suya propia si lo prefiere.

## Publicar en App Store y Play Store

La web sigue en Vercel. La app de las tiendas es la misma, empaquetada con Capacitor
(`appId` `group.almara.borna`). Los enlaces que se envían a clientes salen de `webUrl` en `config.js`,
así que un presupuesto abierto desde el móvil del cliente llega a la web, no a la app.

Hace falta, una sola vez:

- Cuenta de [Apple Developer](https://developer.apple.com/programs/) (99 USD/año) y un Mac con Xcode para la App Store.
- Cuenta de [Google Play Console](https://play.google.com/console) (25 USD, un pago) para Play Store.

En un ordenador, dentro de esta carpeta:

```bash
npm install
node scripts/copiar-www.mjs
npx cap add android
npx cap add ios
npx cap sync
```

- **Android**: `npx cap open android`, en Android Studio **Build → Generate Signed Bundle**, y sube el `.aab` a Play Console.
  Ficha: nombre Borna, categoría Empresas, política de privacidad `https://instaladoresapp.vercel.app/privacidad/`.
- **iPhone (sin Mac)**: se compila en [Codemagic](https://codemagic.io) con `codemagic.yaml`. Los pasos de una sola vez
  están al principio de ese archivo. Después, en Codemagic, **Start new build → Borna iOS → TestFlight**: compila,
  firma y sube la app a TestFlight. Desde App Store Connect se envía a revisión.
- **iPhone (con Mac)**: `npx cap open ios`, firma con tu equipo de Apple, **Product → Archive** y súbelo con Transporter o Xcode.
  La misma URL de privacidad, clasificación 4+, y capturas del iPhone.

**Pagos en la app de las tiendas.** Dentro de la app instalada desde App Store o Play Store no salen precios,
botones de pago ni el portal de Stripe: las tiendas exigen su propio cobro para eso. La empresa se suscribe y
gestiona el pago en la web; en la app solo inicia sesión. Al eliminar la cuenta, la suscripción se cancela sola.

Apple y Google revisan a mano: no es un envío automático desde aquí. La app funciona sin conexión con lo último
que se guardó en el móvil, que es lo que piden para no ser solo un acceso directo a la web.

## Notificaciones

En la app del móvil, **Avisos al móvil → Activar**. Llegan aunque la app esté cerrada: contacto nuevo de la web,
presupuesto aceptado o rechazado, y (si lo enciendes) cuando el cliente abre el presupuesto.

Hace falta, una sola vez, además del SQL:

1. Vuelve a ejecutar `supabase.sql`.
2. Crea la función de Supabase `avisos` con `supabase/functions/avisos/index.ts` y **Verify JWT desactivado**.
3. **Android.** En [Firebase](https://console.firebase.google.com) crea un proyecto, añade una app Android con el
   paquete `group.almara.borna` y descarga `google-services.json` dentro de `android/app/`. En el mismo proyecto,
   cuenta de servicio con permiso de mensajería: su JSON va al secreto `FIREBASE_SERVICE_ACCOUNT` (el archivo entero, en una línea).
4. **iPhone.** En Apple Developer, clave APNs (`.p8`). En los secretos de la función: `APNS_KEY` (el texto del archivo),
   `APNS_KEY_ID` y `APNS_TEAM_ID`. En Xcode, el target App tiene que tener la capacidad **Push Notifications**.

Sin esos secretos el móvil se registra, pero el aviso no puede salir. El botón «Enviar aviso de prueba» lo dice.
