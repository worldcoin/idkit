import { describe, expect, it } from "vitest";
import { getSessionCommitment } from "../lib/session";

const ZERO_COMMITMENT = "0".repeat(64);
const FF_COMMITMENT = "f".repeat(64);
const ZERO_SEED = "0".repeat(64);
const ARBITRARY_SEED = "ab".repeat(32);

describe("getSessionCommitment", () => {
  describe("validation", () => {
    it("rejects missing session_ prefix", () => {
      expect(() => getSessionCommitment("0".repeat(128))).toThrow(
        "Invalid session ID",
      );
    });

    it("rejects wrong hex length (too short)", () => {
      expect(() => getSessionCommitment("session_" + "0".repeat(64))).toThrow(
        "Invalid session ID",
      );
    });

    it("rejects wrong hex length (too long)", () => {
      expect(() => getSessionCommitment("session_" + "0".repeat(130))).toThrow(
        "Invalid session ID",
      );
    });

    it("rejects non-hex characters", () => {
      expect(() => getSessionCommitment("session_" + "g".repeat(128))).toThrow(
        "Invalid session ID",
      );
    });

    it("rejects empty string", () => {
      expect(() => getSessionCommitment("")).toThrow("Invalid session ID");
    });
  });

  describe("commitment extraction", () => {
    it("extracts all-zeros commitment", () => {
      const sessionId = `session_${ZERO_COMMITMENT}${ARBITRARY_SEED}`;
      expect(getSessionCommitment(sessionId)).toBe(0n);
    });

    it("extracts all-ff commitment", () => {
      const sessionId = `session_${FF_COMMITMENT}${ZERO_SEED}`;
      expect(getSessionCommitment(sessionId)).toBe(
        BigInt("0x" + FF_COMMITMENT),
      );
    });

    it("extracts commitment = 1n", () => {
      const commitment = "0".repeat(63) + "1";
      const sessionId = `session_${commitment}${ARBITRARY_SEED}`;
      expect(getSessionCommitment(sessionId)).toBe(1n);
    });

    it("ignores oprf_seed bytes (second half)", () => {
      const commitment = "0".repeat(63) + "1";
      const sessionA = `session_${commitment}${"0".repeat(64)}`;
      const sessionB = `session_${commitment}${"f".repeat(64)}`;
      expect(getSessionCommitment(sessionA)).toBe(
        getSessionCommitment(sessionB),
      );
    });

    it("handles uppercase hex", () => {
      const sessionId = `session_${"A".repeat(64)}${"B".repeat(64)}`;
      expect(getSessionCommitment(sessionId)).toBe(
        BigInt("0x" + "A".repeat(64)),
      );
    });

    it("handles mixed-case hex", () => {
      const sessionId = `session_${"aB".repeat(32)}${"Cd".repeat(32)}`;
      expect(getSessionCommitment(sessionId)).toBe(
        BigInt("0x" + "aB".repeat(32)),
      );
    });

    it("returns bigint type", () => {
      const sessionId = `session_${ZERO_COMMITMENT}${ZERO_SEED}`;
      expect(typeof getSessionCommitment(sessionId)).toBe("bigint");
    });
  });
});
