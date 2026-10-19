import { describe, expect, it } from "vitest";
import vectors from "../../../../../test-vectors/nullifier.json";
import { Nullifier } from "../lib/nullifier";

describe("Nullifier", () => {
  it.each(vectors.valid)(
    "parses $input",
    ({ input, hex, decimal, canonical }) => {
      const value = Nullifier.fromHex(input);
      expect(value.toBigInt()).toBe(BigInt(decimal));
      expect(value.toHex()).toBe(hex);
      expect(value.toCanonicalString()).toBe(canonical);
      const restored = Nullifier.fromCanonicalString(value.toCanonicalString());
      expect(restored.toBigInt()).toBe(value.toBigInt());
      expect(restored.toHex()).toBe(hex);
      expect(Nullifier.fromHex(value.toHex()).toBigInt()).toBe(
        value.toBigInt(),
      );
      const json = JSON.stringify({ nullifier: value });
      expect(JSON.parse(json).nullifier).toBe(hex);
      expect(Nullifier.fromHex(JSON.parse(json).nullifier).toBigInt()).toBe(
        value.toBigInt(),
      );
    },
  );

  it.each(vectors.invalid)("rejects %j", (input) => {
    expect(() => Nullifier.fromHex(input)).toThrow(RangeError);
  });

  it.each(vectors.invalid_canonical)("rejects canonical %j", (input) => {
    expect(() => Nullifier.fromCanonicalString(input)).toThrow(RangeError);
  });

  it("rejects non-string values without coercion", () => {
    for (const value of [null, undefined, 26, 26n, {}, ["1a"]]) {
      // @ts-expect-error Runtime callers can bypass the TypeScript input type.
      expect(() => Nullifier.fromHex(value)).toThrow(TypeError);
      // @ts-expect-error Runtime callers can bypass the TypeScript input type.
      expect(() => Nullifier.fromCanonicalString(value)).toThrow(TypeError);
    }
  });

  it("rejects invalid direct construction from JavaScript", () => {
    for (const value of [-1n, BigInt(vectors.modulus_hex), undefined, 26]) {
      // @ts-expect-error JavaScript callers can bypass the private constructor.
      expect(() => new Nullifier(value)).toThrow(RangeError);
    }
  });
});
