/**
 * Test setup file
 * Pre-initializes WASM for all tests
 */

import { beforeAll } from "vitest";
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import initWasm from "../../wasm/idkit_wasm.js";

// Initialize WASM before all tests
beforeAll(async () => {
  // Get the directory of this file
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const wasmPath = join(__dirname, "../../wasm/idkit_wasm_bg.wasm");
  const wasmBuffer = await readFile(wasmPath);
  await initWasm(wasmBuffer);
});
