import { describe, it, expect, beforeAll } from 'vitest';
import { encodeSignal, generateKey, encrypt, base64Encode, base64Decode } from '../utils';
import { initIDKit } from '../wasm-loader';

describe('Utils', () => {
  beforeAll(async () => {
    await initIDKit();
  });

  describe('encodeSignal', () => {
    it('should encode a signal to hex string', () => {
      const result = encodeSignal('test-signal');
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should produce consistent output for same input', () => {
      const signal = 'consistent-signal';
      const result1 = encodeSignal(signal);
      const result2 = encodeSignal(signal);
      expect(result1).toBe(result2);
    });

    it('should produce different output for different inputs', () => {
      const result1 = encodeSignal('signal-1');
      const result2 = encodeSignal('signal-2');
      expect(result1).not.toBe(result2);
    });

    it('should handle empty string', () => {
      const result = encodeSignal('');
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    });

    it('should handle unicode characters', () => {
      const result = encodeSignal('Hello 世界 🌍');
      expect(result).toMatch(/^0x[0-9a-f]{64}$/);
    });
  });

  describe('generateKey', () => {
    it('should generate key and IV of correct length', () => {
      const { key, iv } = generateKey();
      expect(key).toHaveLength(32); // 256 bits
      expect(iv).toHaveLength(12); // AES-GCM nonce
    });

    it('should generate different keys each time', () => {
      const { key: key1 } = generateKey();
      const { key: key2 } = generateKey();
      expect(key1).not.toEqual(key2);
    });

    it('should generate different IVs each time', () => {
      const { iv: iv1 } = generateKey();
      const { iv: iv2 } = generateKey();
      expect(iv1).not.toEqual(iv2);
    });
  });

  describe('encrypt', () => {
    it('should encrypt data', async () => {
      const { key, iv } = generateKey();
      const plaintext = new TextEncoder().encode('Hello, World!');
      
      const ciphertext = await encrypt(key, iv, plaintext);
      
      expect(ciphertext).toBeInstanceOf(Uint8Array);
      expect(ciphertext.length).toBeGreaterThan(plaintext.length); // includes auth tag
      expect(ciphertext).not.toEqual(plaintext);
    });

    it('should produce different ciphertext with different keys', async () => {
      const plaintext = new TextEncoder().encode('test data');
      
      const { key: key1, iv } = generateKey();
      const { key: key2 } = generateKey();
      
      const ciphertext1 = await encrypt(key1, iv, plaintext);
      const ciphertext2 = await encrypt(key2, iv, plaintext);
      
      expect(ciphertext1).not.toEqual(ciphertext2);
    });

    it('should handle empty data', async () => {
      const { key, iv } = generateKey();
      const plaintext = new Uint8Array(0);
      
      const ciphertext = await encrypt(key, iv, plaintext);
      
      expect(ciphertext).toBeInstanceOf(Uint8Array);
      expect(ciphertext.length).toBeGreaterThan(0); // auth tag present
    });
  });

  describe('base64Encode/Decode', () => {
    it('should encode and decode correctly', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = base64Encode(data);
      const decoded = base64Decode(encoded);
      
      expect(decoded).toEqual(data);
    });

    it('should handle empty array', () => {
      const data = new Uint8Array(0);
      const encoded = base64Encode(data);
      const decoded = base64Decode(encoded);
      
      expect(decoded).toEqual(data);
    });

    it('should produce valid base64', () => {
      const data = new Uint8Array([255, 128, 64, 32, 16, 8, 4, 2, 1, 0]);
      const encoded = base64Encode(data);
      
      // Valid base64 pattern
      expect(encoded).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });
  });
});
