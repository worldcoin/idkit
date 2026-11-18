import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildMultiConstraints,
  describeMultiConstraints,
  normalizeMultiCredentials,
} from "../app/multi-constraints.ts";

const credentials = ["mnc", "passport", "selfie", "proof_of_human"];

test("shared credentials retain order while removing duplicates and unknown values", () => {
  const shared = JSON.parse(
    JSON.stringify([...credentials, "selfie", "unknown", null]),
  );
  assert.deepEqual(normalizeMultiCredentials(shared, []), credentials);
  assert.deepEqual(normalizeMultiCredentials([], credentials), []);
  assert.deepEqual(normalizeMultiCredentials(null, credentials), credentials);
});

for (const combinator of ["enumerate", "any", "all"]) {
  test(`${combinator} preserves selected order in the request JSON`, () => {
    const options = { signal: "test-signal", genesis_issued_at_min: 123 };
    const constraints = buildMultiConstraints(combinator, credentials, options);
    assert.deepEqual(JSON.parse(JSON.stringify(constraints)), {
      [combinator]: credentials.map((type) => ({ type, ...options })),
    });
    assert.deepEqual(credentials, [
      "mnc",
      "passport",
      "selfie",
      "proof_of_human",
    ]);
  });
}

test("description follows the same order as the request", () => {
  assert.equal(
    describeMultiConstraints("enumerate", credentials),
    "Enumerate(MNC, Passport, Selfie, PoH)",
  );
  assert.equal(
    describeMultiConstraints("any", credentials),
    "MNC OR Passport OR Selfie OR PoH",
  );
  assert.equal(describeMultiConstraints("all", []), "no credentials");
});

test("default PoH/Selfie requests retain their existing payload", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        buildMultiConstraints("any", ["proof_of_human", "selfie"]),
      ),
    ),
    {
      any: [{ type: "proof_of_human" }, { type: "selfie" }],
    },
  );
});

test("session constraints preserve order and genesis without adding a signal", () => {
  assert.deepEqual(
    JSON.parse(
      JSON.stringify(
        buildMultiConstraints("enumerate", ["passport", "selfie"], {
          genesis_issued_at_min: 123,
        }),
      ),
    ),
    {
      enumerate: [
        { type: "passport", genesis_issued_at_min: 123 },
        { type: "selfie", genesis_issued_at_min: 123 },
      ],
    },
  );
});
