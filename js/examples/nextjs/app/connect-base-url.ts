/** Presets offered next to the free-text connect base URL input. */
export const CONNECT_BASE_URL_PRESETS: readonly {
  label: string;
  url: string;
}[] = [
  { label: "Staging World App", url: "https://staging.world.org/verify" },
  {
    label: "Staging web authenticator",
    url: "https://authenticator.toolsforhumanity.dev/verify",
  },
];

export const CONNECT_BASE_URL_MAX_LENGTH = 500;

const LOCAL_HOSTNAMES: readonly string[] = ["localhost", "127.0.0.1"];

export type ConnectBaseUrlResult =
  | { ok: true; url: string | undefined }
  | { ok: false; error: string };

/**
 * Validates the connect base URL typed into the configuration panel.
 *
 * Empty input means "no override" (the SDK picks the base from `environment`).
 * IDKit appends `?t=wld&i=...` to the value verbatim, so a query or fragment
 * would produce a broken connector URL and is rejected here. For the same
 * reason the value must already be in canonical form.
 */
export function parseConnectBaseUrl(input: string): ConnectBaseUrlResult {
  const trimmed = input.trim();
  if (trimmed === "") {
    return { ok: true, url: undefined };
  }
  if (trimmed.length > CONNECT_BASE_URL_MAX_LENGTH) {
    return {
      ok: false,
      error: `Connect base URL must be at most ${CONNECT_BASE_URL_MAX_LENGTH} characters.`,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return {
      ok: false,
      error:
        "Connect base URL must be an absolute URL, for example https://staging.world.org/verify.",
    };
  }

  const isLocalHttp =
    parsed.protocol === "http:" && LOCAL_HOSTNAMES.includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !isLocalHttp) {
    return {
      ok: false,
      error: "Connect base URL must use https:// (http:// only for localhost or 127.0.0.1).",
    };
  }
  if (parsed.username !== "" || parsed.password !== "") {
    return {
      ok: false,
      error: "Connect base URL must not contain credentials.",
    };
  }
  if (parsed.search !== "" || parsed.hash !== "" || /[?#]/.test(trimmed)) {
    return {
      ok: false,
      error:
        "Connect base URL must not contain a query string or fragment; IDKit appends its own.",
    };
  }

  // IDKit and the QR code use the typed string, not the parsed URL. Require
  // the canonical spelling so both always agree on the host and path.
  if (parsed.href !== trimmed && parsed.href !== `${trimmed}/`) {
    return {
      ok: false,
      error: `Connect base URL must be written in its canonical form: ${parsed.href}`,
    };
  }

  return { ok: true, url: trimmed };
}
