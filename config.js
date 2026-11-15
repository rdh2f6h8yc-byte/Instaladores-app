// Datos de conexión con Supabase (Project Settings → API) del proyecto NUEVO de esta app.
// La publishable key es pública por diseño: la seguridad la ponen las reglas (RLS) de la base de datos.
window.ALMARA_CONFIG = {
  // Nombre comercial de la app (sale en la portada y en el título)
  producto: "Borna",
  // Correo o teléfono al que te escriben las empresas para activar la suscripción
  soporte: "",
  // Suscripción (Stripe). Mientras estén vacíos, la app pide escribir a «soporte».
  // Precio por empresa, técnicos incluidos (sin IVA)
  precioMensual: "19 € al mes",
  precioAnual: "190 € al año (2 meses gratis)",
  pagoMensual: "",  // enlace de pago de Stripe (Payment Link) de la suscripción mensual
  pagoAnual: "",    // enlace de pago de Stripe de la suscripción anual
  portal: "",   // enlace del portal de cliente de Stripe (cambiar tarjeta, facturas, cancelar)
  supabaseUrl: "https://arhczbzfrukzugwxmfri.supabase.co",
  supabaseAnonKey: "sb_publishable_mfH8pMp6z9zSlCBySj6XIw_ZyluI17O",
  // Avisos al móvil: desactivados hasta montar el envío en el proyecto nuevo
  avisos: false,
  vapidPublicKey: ""
};
