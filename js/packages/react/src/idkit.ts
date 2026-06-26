import { createIDKitNamespace } from "@worldcoin/idkit-core/internal";
import packageJson from "../package.json";

export const IDKit = createIDKitNamespace({
  package_name: "idkit_react",
  package_version: packageJson.version,
});
