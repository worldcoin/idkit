import { webcrypto } from "node:crypto";
import { setDefaultRandomValues } from "./lib/runtime";

setDefaultRandomValues((bytes) => webcrypto.getRandomValues(bytes));
export * from "./index";
