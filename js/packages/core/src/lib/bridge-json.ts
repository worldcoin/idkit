import { decodeUtf8, decodeUtf8Lossy } from "./encoding";

/**
 * JSON.parse keeps only the last duplicate field. Serde rejects duplicates of
 * fields a struct consumes, while allowing duplicates of ignored extensions.
 * Retain that small piece of source information for the bridge's typed parsers.
 */
type Metadata = {
  duplicates?: Set<string>;
  invalidKeys?: boolean;
  invalidUtf8?: boolean;
  nonUnsignedInteger?: boolean;
  children: Map<string | number, Metadata>;
};
const sourceMetadata = new WeakMap<object, Metadata>();

export function assertUniqueJsonFields(
  value: object,
  fields: readonly string[],
): void {
  const metadata = sourceMetadata.get(value);
  if (
    metadata &&
    (metadata.invalidKeys ||
      fields.some(
        (field) =>
          metadata.duplicates?.has(field) ||
          metadata.children.get(field)?.invalidUtf8,
      ))
  ) {
    throw new Error("unexpected_response");
  }
}

export function assertJsonIntegerFields(
  value: object,
  fields: readonly string[],
): void {
  const metadata = sourceMetadata.get(value);
  if (
    metadata &&
    fields.some((field) => metadata.children.get(field)?.nonUnsignedInteger)
  ) {
    throw new Error("unexpected_response");
  }
}

export function parseBridgeJson(input: string | Uint8Array): unknown {
  // Delegate syntax and scalar decoding to the host's standard JSON parser.
  // The following scan only visits already-validated JSON to retain duplicates.
  const bytes = typeof input === "string" ? undefined : input;
  const value: unknown = JSON.parse(
    bytes ? decodeUtf8Lossy(bytes) : (input as string),
  );
  // One code unit per original byte keeps token offsets stable. Only tokens
  // representing strings need UTF-8 decoding; ASCII JSON syntax is unchanged.
  const source = bytes
    ? Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")
    : (input as string);
  let position = 0;
  const whitespace = () => {
    while (/[\u0009\u000a\u000d ]/.test(source[position] ?? "x")) position++;
  };
  const stringEnd = () => {
    const start = position;
    position++;
    while (source[position] !== '"') {
      if (source[position] === "\\") position++;
      position++;
    }
    position++;
    if (bytes) {
      try {
        decodeUtf8(bytes.subarray(start, position));
      } catch {
        return true;
      }
    }
    return false;
  };
  function scan(): Metadata | undefined {
    whitespace();
    const token = source[position];
    if (token === '"') {
      return stringEnd()
        ? { children: new Map(), invalidUtf8: true }
        : undefined;
    }
    if (token !== "{" && token !== "[") {
      const start = position;
      while (
        position < source.length &&
        !/[\u0009\u000a\u000d ,\]}]/.test(source[position]!)
      )
        position++;
      const number = source.slice(start, position);
      return /^[-\d]/.test(number) &&
        (number.startsWith("-") || /[.eE]/.test(number))
        ? { children: new Map(), nonUnsignedInteger: true }
        : undefined;
    }
    const object = token === "{";
    const end = object ? "}" : "]";
    const result: Metadata = { children: new Map() };
    const seen = new Set<string>();
    let index = 0;
    position++;
    whitespace();
    while (source[position] !== end) {
      let key: string | number = index++;
      if (object) {
        const start = position;
        if (stringEnd()) result.invalidKeys = true;
        key = JSON.parse(
          bytes
            ? decodeUtf8Lossy(bytes.subarray(start, position))
            : source.slice(start, position),
        ) as string;
        if (seen.has(key)) (result.duplicates ??= new Set()).add(key);
        seen.add(key);
        whitespace();
        position++; // colon
      }
      const child = scan();
      // Only the final value for a duplicate property survives JSON.parse.
      if (child) result.children.set(key, child);
      else result.children.delete(key);
      whitespace();
      if (source[position] === end) break;
      position++; // comma
      whitespace();
    }
    position++;
    return result;
  }
  function attach(current: unknown, metadata: Metadata | undefined): void {
    if (!metadata || current == null || typeof current !== "object") return;
    sourceMetadata.set(current, metadata);
    for (const [key, child] of metadata.children) {
      attach((current as Record<string | number, unknown>)[key], child);
    }
  }
  attach(value, scan());
  return value;
}
