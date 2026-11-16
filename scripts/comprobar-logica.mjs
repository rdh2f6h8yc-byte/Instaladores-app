import fs from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const src = fs.readFileSync(fileURLToPath(new URL("../comun.js", import.meta.url)), "utf8");
const sandbox = { globalThis: {}, module: { exports: {} } };
sandbox.globalThis.globalThis = sandbox.globalThis;
vm.runInNewContext(src, sandbox);
const api = sandbox.module.exports.waNum ? sandbox.module.exports : sandbox.globalThis.BornaUtil;
const { waNum, srcImagen } = api;

const casos = [
  ["612345678", "34612345678"],
  ["+34 612 345 678", "34612345678"],
  ["34612345678", "34612345678"],
  ["0034612345678", "34612345678"],
  ["", ""],
];
for (const [entra, sale] of casos) {
  if (waNum(entra) !== sale) throw new Error("waNum(" + entra + ") = " + waNum(entra) + " ≠ " + sale);
}

const png = "data:image/png;base64," + "A".repeat(40);
const jpg = "data:image/jpeg;base64," + "B".repeat(40);
if (srcImagen(png) !== png) throw new Error("png válido rechazado");
if (srcImagen(jpg) !== jpg) throw new Error("jpeg válido rechazado");
const malo = 'x" onerror="alert(1)" ' + "A".repeat(80);
if (srcImagen(malo) !== "") throw new Error("payload XSS aceptado");
if (srcImagen("javascript:alert(1)") !== "") throw new Error("javascript: aceptado");
if (srcImagen("data:image/svg+xml;base64," + "A".repeat(40)) !== "") throw new Error("svg aceptado");
console.log("ok");
