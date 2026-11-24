# Correos de Borna (Supabase → Authentication → Emails)

Pega cada archivo en su plantilla («Source», no «Preview»):

| Plantilla de Supabase | Asunto | Archivo |
|---|---|---|
| Confirm signup | Confirma tu cuenta de Borna | confirmar-registro.html |
| Reset password | Elige una contraseña nueva para Borna | cambiar-contrasena.html |
| Change email address | Confirma tu nuevo correo en Borna | cambiar-correo.html |
| Magic link | Tu enlace para entrar en Borna | enlace-acceso.html |

## Envío con Resend (SMTP propio)
Supabase → Authentication → Emails → SMTP Settings → Enable custom SMTP:
- Host: `smtp.resend.com` · Puerto: `465` · Usuario: `resend`
- Contraseña: la API key de Resend (empieza por `re_`)
- Remitente: `hola@TU-DOMINIO` · Nombre: `Borna`

Resend solo envía desde un dominio verificado (no sirve vercel.app).
