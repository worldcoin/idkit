import { describe, it, expect } from 'vitest';
import { Credential, VerificationLevel, IDKitError, AppError } from '../types';

describe('Types', () => {
  describe('Credential', () => {
    it('should have all expected credential types', () => {
      expect(Credential.Orb).toBe('orb');
      expect(Credential.Face).toBe('face');
      expect(Credential.SecureDocument).toBe('secure_document');
      expect(Credential.Document).toBe('document');
      expect(Credential.Device).toBe('device');
    });
  });

  describe('VerificationLevel', () => {
    it('should have all expected verification levels', () => {
      expect(VerificationLevel.Orb).toBe('orb');
      expect(VerificationLevel.Face).toBe('face');
      expect(VerificationLevel.Device).toBe('device');
      expect(VerificationLevel.Document).toBe('document');
      expect(VerificationLevel.SecureDocument).toBe('secure_document');
    });
  });

  describe('AppError', () => {
    it('should have all expected error types', () => {
      expect(AppError.UserRejected).toBe('user_rejected');
      expect(AppError.CredentialUnavailable).toBe('credential_unavailable');
      expect(AppError.MalformedRequest).toBe('malformed_request');
      expect(AppError.InvalidNetwork).toBe('invalid_network');
      expect(AppError.InclusionProofPending).toBe('inclusion_proof_pending');
      expect(AppError.InclusionProofFailed).toBe('inclusion_proof_failed');
      expect(AppError.UnexpectedResponse).toBe('unexpected_response');
      expect(AppError.ConnectionFailed).toBe('connection_failed');
      expect(AppError.GenericError).toBe('generic_error');
    });
  });

  describe('IDKitError', () => {
    it('should create error with message', () => {
      const error = new IDKitError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('IDKitError');
      expect(error instanceof Error).toBe(true);
    });

    it('should create error with code', () => {
      const error = new IDKitError('Test error', AppError.UserRejected);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe(AppError.UserRejected);
    });

    it('should be throwable', () => {
      expect(() => {
        throw new IDKitError('Test throw');
      }).toThrow('Test throw');
    });

    it('should be catchable', () => {
      try {
        throw new IDKitError('Test catch');
      } catch (e) {
        expect(e).toBeInstanceOf(IDKitError);
        expect((e as IDKitError).message).toBe('Test catch');
      }
    });
  });
});
