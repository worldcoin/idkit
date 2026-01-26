export enum AppErrorCodes {
  ConnectionFailed = "connection_failed",
  VerificationRejected = "verification_rejected",
  MaxVerificationsReached = "max_verifications_reached",
  CredentialUnavailable = "credential_unavailable",
  MalformedRequest = "malformed_request",
  InvalidNetwork = "invalid_network",
  InclusionProofFailed = "inclusion_proof_failed",
  InclusionProofPending = "inclusion_proof_pending",
  UnexpectedResponse = "unexpected_response",
  FailedByHostApp = "failed_by_host_app",
  GenericError = "generic_error",
}

export enum VerificationState {
  PreparingClient = "loading_widget",
  WaitingForConnection = "awaiting_connection",
  WaitingForApp = "awaiting_app",
  Confirmed = "confirmed",
  Failed = "failed",
}

export enum ResponseStatus {
  Retrieved = "retrieved",
  Completed = "completed",
  Initialized = "initialized",
}
