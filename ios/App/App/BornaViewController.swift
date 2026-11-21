import UIKit
import Capacitor

/// Pantalla principal de la app: la de Capacitor más los plugins propios de Borna.
class BornaViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(CompraApplePlugin())
    }
}
