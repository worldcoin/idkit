import { webcrypto } from "node:crypto";
import { setNodeRandomValues } from "./lib/runtime";

setNodeRandomValues((bytes) => webcrypto.getRandomValues(bytes));
export * from "./index";
