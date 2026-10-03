import { getRandomValues } from "expo-crypto";
import { setDefaultRandomValues } from "./lib/runtime";

setDefaultRandomValues((bytes) => getRandomValues(bytes));
export * from "./index";
