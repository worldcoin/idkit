import type { AppErrorCodes } from "./bridge";
import type { CredentialType } from "./config";

export interface ISuccessResult {
  proof: string;
  merkle_root: string;
  nullifier_hash: string;
  /** The credential type used to generate the proof */
  verification_level: CredentialType;
}

export interface IErrorState {
  code: AppErrorCodes;
  message?: string;
}
