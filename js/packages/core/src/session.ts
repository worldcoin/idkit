/**
 * Session management for IDKit
 */

import { ensureInitialized, WasmAppId } from './wasm-loader.js';
import {
  SessionConfig,
  SessionStatus,
  StatusResponse,
  Proof,
  IDKitError,
  Credential,
} from './types.js';
import { encodeSignal, generateKey, encrypt } from './utils.js';

const DEFAULT_BRIDGE_URL = 'https://bridge.worldcoin.org';
const DEFAULT_TIMEOUT = 120000; // 2 minutes

interface BridgeRequestPayload {
  app_id: string;
  action: string;
  requests: Array<{
    credential_type: Credential;
    signal: string;
    face_auth?: boolean;
  }>;
  constraints?: any;
}

/**
 * IDKit Session
 * 
 * Manages the verification flow with World App
 */
export class Session {
  private requestId: string;
  private key: Uint8Array;
  private iv: Uint8Array;
  private bridgeUrl: string;
  private config: SessionConfig;

  private constructor(
    requestId: string,
    key: Uint8Array,
    iv: Uint8Array,
    config: SessionConfig
  ) {
    this.requestId = requestId;
    this.key = key;
    this.iv = iv;
    this.config = config;
    this.bridgeUrl = config.bridge_url || DEFAULT_BRIDGE_URL;
  }

  /**
   * Create a new session
   */
  static async create(config: SessionConfig): Promise<Session> {
    await ensureInitialized();

    // Validate config
    Session.validateConfig(config);

    // Generate encryption key
    const { key, iv } = generateKey();

    // Encode signals
    const requests = config.requests.map((req) => ({
      credential_type: req.type,
      signal: encodeSignal(req.signal),
      face_auth: req.face_auth,
    }));

    // Build bridge payload
    const payload: BridgeRequestPayload = {
      app_id: config.app_id,
      action: config.action,
      requests,
      constraints: config.constraints,
    };

    // Encrypt payload
    const payloadJson = JSON.stringify(payload);
    const encrypted = await encrypt(key, iv, new TextEncoder().encode(payloadJson));

    // Send to bridge
    const bridgeUrl = config.bridge_url || DEFAULT_BRIDGE_URL;
    const response = await fetch(`${bridgeUrl}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: encrypted as BodyInit,
    });

    if (!response.ok) {
      throw new IDKitError(`Bridge request failed: ${response.statusText}`);
    }

    const { request_id } = await response.json();

    return new Session(request_id, key, iv, config);
  }

  /**
   * Create a session from verification level (legacy API)
   */
  static async fromVerificationLevel(
    appId: string,
    action: string,
    verificationLevel: string,
    signal: string,
    bridgeUrl?: string
  ): Promise<Session> {
    // Map verification level to requests
    const requests = Session.verificationLevelToRequests(verificationLevel, signal);

    return Session.create({
      app_id: appId,
      action,
      requests,
      bridge_url: bridgeUrl,
    });
  }

  /**
   * Get the World App connection URL
   */
  connectUrl(): string {
    const keyBase64 = btoa(String.fromCharCode(...this.key));
    const encodedKey = encodeURIComponent(keyBase64);

    let url = `https://worldcoin.org/verify?t=wld&i=${this.requestId}&k=${encodedKey}`;

    if (this.bridgeUrl !== DEFAULT_BRIDGE_URL) {
      const encodedBridge = encodeURIComponent(this.bridgeUrl);
      url += `&b=${encodedBridge}`;
    }

    return url;
  }

  /**
   * Poll for current status (non-blocking)
   */
  async poll(): Promise<StatusResponse> {
    const response = await fetch(`${this.bridgeUrl}/response/${this.requestId}`);

    if (!response.ok) {
      if (response.status === 404) {
        return { status: SessionStatus.WaitingForConnection };
      }
      throw new IDKitError(`Failed to poll status: ${response.statusText}`);
    }

    const data = await response.json();

    if (data.status === 'pending') {
      return { status: SessionStatus.AwaitingConfirmation };
    }

    if (data.status === 'completed') {
      // Decrypt proof
      const encrypted = new Uint8Array(atob(data.response).split('').map((c) => c.charCodeAt(0)));
      const decrypted = await this.decrypt(encrypted);
      const proof: Proof = JSON.parse(new TextDecoder().decode(decrypted));

      return { status: SessionStatus.Confirmed, proof };
    }

    if (data.status === 'failed') {
      return { status: SessionStatus.Failed, error: data.error || 'Unknown error' };
    }

    throw new IDKitError(`Unexpected status: ${data.status}`);
  }

  /**
   * Wait for proof with timeout
   */
  async waitForProof(timeout: number = DEFAULT_TIMEOUT): Promise<Proof> {
    const start = Date.now();

    while (Date.now() - start < timeout) {
      const status = await this.poll();

      if (status.status === SessionStatus.Confirmed) {
        return status.proof;
      }

      if (status.status === SessionStatus.Failed) {
        throw new IDKitError(`Verification failed: ${status.error}`);
      }

      // Wait 1 second before polling again
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    throw new IDKitError('Request timed out');
  }

  // Private helpers

  private static validateConfig(config: SessionConfig): void {
    if (!config.app_id) {
      throw new IDKitError('app_id is required');
    }

    if (!config.action) {
      throw new IDKitError('action is required');
    }

    if (!config.requests || config.requests.length === 0) {
      throw new IDKitError('At least one request is required');
    }

    // Validate face_auth
    for (const req of config.requests) {
      if (req.face_auth && req.type !== Credential.Orb && req.type !== Credential.Face) {
        throw new IDKitError(
          `face_auth is only supported for ${Credential.Orb} and ${Credential.Face} credentials`
        );
      }
    }
  }

  private static verificationLevelToRequests(level: string, signal: string): any[] {
    switch (level) {
      case 'orb':
        return [{ type: Credential.Orb, signal }];
      case 'face':
        return [{ type: Credential.Face, signal }];
      case 'device':
        return [{ type: Credential.Orb, signal }, { type: Credential.Device, signal }];
      case 'document':
        return [
          { type: Credential.Document, signal },
          { type: Credential.SecureDocument, signal },
          { type: Credential.Orb, signal },
        ];
      case 'secure_document':
        return [
          { type: Credential.SecureDocument, signal },
          { type: Credential.Orb, signal },
        ];
      default:
        throw new IDKitError(`Unknown verification level: ${level}`);
    }
  }

  private async decrypt(ciphertext: Uint8Array): Promise<Uint8Array> {
    // Use Web Crypto API for decryption
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      this.key as BufferSource,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    );

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: this.iv as BufferSource },
      cryptoKey,
      ciphertext as BufferSource
    );

    return new Uint8Array(decrypted);
  }
}
