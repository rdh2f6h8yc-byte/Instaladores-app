import UIKit
import Capacitor

/// Pantalla principal de la app: la de Capacitor más los plugins propios de Borna.
class BornaViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CompraApplePlugin())
        // Volver atrás deslizando desde el borde izquierdo, como en Safari
        webView?.allowsBackForwardNavigationGestures = true
    }

    /// Borna tiene varias páginas en carpetas (/clientes/, /planos/, /material/…).
    /// El enrutador de Capacitor manda cualquier ruta sin extensión al index.html de la raíz
    /// (pensado para apps de una sola página), así que al tocar «Clientes» se volvía a cargar el inicio.
    override open func router() -> Router {
        return BornaRouter()
    }
}

/// Sirve la index.html de cada carpeta; si la carpeta no existe, la de la raíz.
struct BornaRouter: Router {
    var basePath: String = ""

    func route(for path: String) -> String {
        let url = URL(fileURLWithPath: path)
        guard url.pathExtension.isEmpty else { return basePath + path }

        var carpeta = path.isEmpty ? "/" : path
        if !carpeta.hasSuffix("/") { carpeta += "/" }
        let candidata = basePath + carpeta + "index.html"
        if FileManager.default.fileExists(atPath: candidata) { return candidata }
        return basePath + "/index.html"
    }
}
