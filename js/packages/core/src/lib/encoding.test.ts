import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { encodeUtf8, decodeUtf8, decodeUtf8Lossy } from "./encoding";
describe("portable UTF-8", () => {
  it("matches browser encoder scalar replacement", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 65535 }), { maxLength: 100 }),
        (units) => {
          const text = String.fromCharCode(...units);
          expect(encodeUtf8(text)).toEqual(new TextEncoder().encode(text));
        },
      ),
      { seed: 20260912, numRuns: 300 },
    );
  });
  it("matches strict and replacement browser decoding", () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 100 }), (bytes) => {
        expect(decodeUtf8Lossy(bytes)).toBe(
          new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes),
        );
        let text: string;
        try {
          text = new TextDecoder("utf-8", {
            fatal: true,
            ignoreBOM: true,
          }).decode(bytes);
        } catch {
          expect(() => decodeUtf8(bytes)).toThrow();
          return;
        }
        expect(decodeUtf8(bytes)).toBe(text);
      }),
      { seed: 20260912, numRuns: 300 },
    );
    for (const bytes of [
      [0xef, 0xbb, 0xbf],
      [0xed, 0xa0, 0x80],
      [0xe2, 0x82, 0x41],
      [0xf0, 0x80, 0x80, 0x80],
    ]) {
      expect(decodeUtf8Lossy(new Uint8Array(bytes))).toBe(
        new TextDecoder("utf-8", { ignoreBOM: true }).decode(
          new Uint8Array(bytes),
        ),
      );
    }
  });
});
