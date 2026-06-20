/**
 * Script-tag/CDN entry for @worldcoin/idkit-core.
 *
 * This file intentionally exposes the client IDKit namespace only. RP signing
 * remains available through the package's server-side `/signing` export and is
 * not placed on the browser global.
 */

import { IDKit } from "./request";
import { setIDKitWasmInitInput } from "./lib/wasm";

type IDKitGlobal = typeof IDKit;

declare global {
  interface Window {
    IDKit: IDKitGlobal;
  }

  // eslint-disable-next-line no-var
  var IDKit: IDKitGlobal;
}

function currentScriptUrl(): string | undefined {
  if (typeof document === "undefined") {
    return undefined;
  }

  const script = document.currentScript as HTMLScriptElement | null;
  if (script?.src) {
    return script.src;
  }

  return undefined;
}

const scriptUrl = currentScriptUrl();
if (scriptUrl) {
  setIDKitWasmInitInput({
    module_or_path: new URL("idkit_wasm_bg.wasm", scriptUrl),
  });
}

globalThis.IDKit = IDKit;

export default IDKit;
