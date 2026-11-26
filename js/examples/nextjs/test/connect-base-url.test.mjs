import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CONNECT_BASE_URL_PRESETS,
  parseConnectBaseUrl,
} from "../app/connect-base-url.ts";

test("empty input means no override", () => {
  assert.deepEqual(parseConnectBaseUrl(""), { ok: true, url: undefined });
  assert.deepEqual(parseConnectBaseUrl("   "), { ok: true, url: undefined });
});

test("presets are valid and returned unchanged", () => {
  assert.deepEqual(
    CONNECT_BASE_URL_PRESETS.map((preset) => preset.url),
    [
      "https://staging.world.org/verify",
      "https://authenticator.toolsforhumanity.dev/verify",
    ],
  );
  for (const { url } of CONNECT_BASE_URL_PRESETS) {
    assert.deepEqual(parseConnectBaseUrl(url), { ok: true, url });
  }
});

test("accepts https and local http, trimming whitespace", () => {
  for (const [input, url] of [
    [" https://example.com/verify ", "https://example.com/verify"],
    ["https://example.com:8443/a/b", "https://example.com:8443/a/b"],
    ["http://localhost:5173/verify", "http://localhost:5173/verify"],
    ["http://127.0.0.1:8787/verify", "http://127.0.0.1:8787/verify"],
    ["https://localhost/verify", "https://localhost/verify"],
    ["https://example.com", "https://example.com"],
    ["https://example.com/", "https://example.com/"],
  ]) {
    assert.deepEqual(parseConnectBaseUrl(input), { ok: true, url });
  }
});

test("non-canonical input names the canonical form", () => {
  assert.deepEqual(parseConnectBaseUrl("HTTPS://EXAMPLE.com/verify"), {
    ok: false,
    error:
      "Connect base URL must be written in its canonical form: https://example.com/verify",
  });
});

test("rejects everything else with a message", () => {
  for (const input of [
    "staging.world.org/verify",
    "/verify",
    "http://example.com/verify",
    "http://localhost.example.com/verify",
    "javascript:alert(1)",
    "worldapp://verify",
    "ftp://example.com/verify",
    "https://user:secret@example.com/verify",
    "https://example.com/verify?next=1",
    "https://example.com/verify?",
    "https://example.com/verify#frag",
    "https://example.com/verify#",
    `https://example.com/${"a".repeat(500)}`,
    // Accepted by the URL parser, but not what IDKit would put in the QR code.
    "https:example.com/verify",
    "https:/example.com/verify",
    "https:///verify",
    "https:\\\\example.com\\verify",
    "https://evil.example\\@example.com/verify",
    "https://@example.com/verify",
    "https://exam\nple.com/verify",
    "HTTPS://EXAMPLE.com/verify",
    "https://bücher.example/verify",
    "http://127.1/verify",
    "http://2130706433/verify",
    "http://[::1]:3000/verify",
    "http://localhost./verify",
  ]) {
    const result = parseConnectBaseUrl(input);
    assert.equal(result.ok, false, input);
    assert.ok(result.error.length > 0, input);
  }
});
