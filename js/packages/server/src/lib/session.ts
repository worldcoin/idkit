const SESSION_ID_PATTERN = /^session_[0-9a-fA-F]{128}$/;

export function getSessionCommitment(sessionId: string): bigint {
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error(
      "Invalid session ID: expected format session_<128 hex characters>",
    );
  }

  const commitmentHex = sessionId.slice(8, 72); // "session_".length = 8, commitment = 64 hex chars
  return BigInt(`0x${commitmentHex}`);
}
