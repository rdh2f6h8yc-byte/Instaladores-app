import Foundation
import UIKit
import Capacitor
import AuthenticationServices
import CryptoKit
import Security

/// Entrar en Borna con Apple (nativo) o con Google (ventana segura del sistema).
/// Desde la web se llama como Capacitor.registerPlugin("Acceso").
@objc(AccesoPlugin)
public class AccesoPlugin: CAPPlugin, CAPBridgedPlugin, ASAuthorizationControllerDelegate,
    ASAuthorizationControllerPresentationContextProviding, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "AccesoPlugin"
    public let jsName = "Acceso"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "apple", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "web", returnType: CAPPluginReturnPromise)
    ]

    private var llamada: CAPPluginCall?
    private var nonce = ""
    private var sesionWeb: ASWebAuthenticationSession?

    // ---------- Iniciar sesión con Apple ----------
    @objc func apple(_ call: CAPPluginCall) {
        let raw = AccesoPlugin.nonceAleatorio()
        nonce = raw
        llamada = call
        let peticion = ASAuthorizationAppleIDProvider().createRequest()
        peticion.requestedScopes = [.fullName, .email]
        peticion.nonce = AccesoPlugin.sha256(raw)
        DispatchQueue.main.async {
            let c = ASAuthorizationController(authorizationRequests: [peticion])
            c.delegate = self
            c.presentationContextProvider = self
            c.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = llamada else { return }
        llamada = nil
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let datos = cred.identityToken, let token = String(data: datos, encoding: .utf8) else {
            call.reject("Apple no ha devuelto los datos de acceso")
            return
        }
        var r: [String: Any] = ["idToken": token, "nonce": nonce]
        if let c = cred.authorizationCode, let codigo = String(data: c, encoding: .utf8) { r["codigo"] = codigo }
        let nombre = [cred.fullName?.givenName, cred.fullName?.familyName].compactMap { $0 }.joined(separator: " ")
        if !nombre.isEmpty { r["nombre"] = nombre }
        call.resolve(r)
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = llamada else { return }
        llamada = nil
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            call.reject("cancelado", "CANCELADO")
            return
        }
        call.reject(error.localizedDescription)
    }

    // ---------- Iniciar sesión con Google (u otro proveedor web) ----------
    @objc func web(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s), let esquema = call.getString("esquema") else {
            call.reject("Falta la dirección de acceso")
            return
        }
        DispatchQueue.main.async {
            let ses = ASWebAuthenticationSession(url: url, callbackURLScheme: esquema) { [weak self] vuelta, error in
                self?.sesionWeb = nil
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("cancelado", "CANCELADO")
                    return
                }
                if let e = error {
                    call.reject(e.localizedDescription)
                    return
                }
                call.resolve(["url": vuelta?.absoluteString ?? ""])
            }
            ses.presentationContextProvider = self
            self.sesionWeb = ses
            if !ses.start() { call.reject("No se ha podido abrir la ventana de acceso") }
        }
    }

    // ---------- Ventana sobre la que se muestran ----------
    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor { ventana() }
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor { ventana() }
    private func ventana() -> UIWindow {
        if let w = bridge?.viewController?.view.window { return w }
        let escenas = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return escenas.flatMap { $0.windows }.first { $0.isKeyWindow } ?? UIWindow()
    }

    // ---------- Utilidades ----------
    static func nonceAleatorio(_ largo: Int = 32) -> String {
        let letras = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var bytes = [UInt8](repeating: 0, count: largo)
        if SecRandomCopyBytes(kSecRandomDefault, largo, &bytes) != errSecSuccess {
            return UUID().uuidString + UUID().uuidString
        }
        return String(bytes.map { letras[Int($0) % letras.count] })
    }

    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}
