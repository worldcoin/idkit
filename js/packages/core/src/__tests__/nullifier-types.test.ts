import { expectTypeOf, it } from "vitest";
import { Nullifier } from "../nullifier";
import type {
  ResponseItemV3,
  ResponseItemV4,
  SelfieCheckResponseItemV4,
} from "../types/result";

it("keeps existing uniqueness nullifiers as strings", () => {
  expectTypeOf<ResponseItemV3["nullifier"]>().toEqualTypeOf<string>();
  expectTypeOf<ResponseItemV4["nullifier"]>().toEqualTypeOf<string>();
  expectTypeOf<
    SelfieCheckResponseItemV4["nullifier"]
  >().toEqualTypeOf<string>();
  expectTypeOf(Nullifier.fromHex("0x1a").toBigInt()).toEqualTypeOf<bigint>();
});
