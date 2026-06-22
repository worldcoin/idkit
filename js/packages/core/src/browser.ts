/**
 * Script-tag/CDN entry for @worldcoin/idkit-core.
 *
 * This file intentionally exposes the client IDKit namespace only. RP signing
 * remains available through the package's server-side `/signing` export and is
 * not placed on the browser global.
 */

import { IDKit } from "./request";

type IDKitGlobal = typeof IDKit;

declare global {
  interface Window {
    IDKit: IDKitGlobal;
  }

  // eslint-disable-next-line no-var
  var IDKit: IDKitGlobal;
}

globalThis.IDKit = IDKit;

export default IDKit;
