import { describe, it, expect, beforeAll, vi } from 'vitest';
import { Session } from '../session';
import { Credential, IDKitError } from '../types';
import { initIDKit } from '../wasm-loader';

describe('Session', () => {
  beforeAll(async () => {
    await initIDKit();
  });

  describe('Configuration Validation', () => {
    it('should reject missing app_id', async () => {
      await expect(
        Session.create({
          app_id: '',
          action: 'test',
          requests: [{ type: Credential.Orb, signal: 'test' }],
        })
      ).rejects.toThrow('app_id is required');
    });

    it('should reject missing action', async () => {
      await expect(
        Session.create({
          app_id: 'app_test',
          action: '',
          requests: [{ type: Credential.Orb, signal: 'test' }],
        })
      ).rejects.toThrow('action is required');
    });

    it('should reject empty requests', async () => {
      await expect(
        Session.create({
          app_id: 'app_test',
          action: 'test',
          requests: [],
        })
      ).rejects.toThrow('At least one request is required');
    });

    it('should reject face_auth on non-orb/face credentials', async () => {
      await expect(
        Session.create({
          app_id: 'app_test',
          action: 'test',
          requests: [
            { type: Credential.Document, signal: 'test', face_auth: true },
          ],
        })
      ).rejects.toThrow('face_auth is only supported');
    });

    it('should allow face_auth on orb credential', async () => {
      // Mock fetch to avoid actual network call
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'test-id' }),
      });
      global.fetch = mockFetch;

      await expect(
        Session.create({
          app_id: 'app_test',
          action: 'test',
          requests: [{ type: Credential.Orb, signal: 'test', face_auth: true }],
        })
      ).resolves.toBeDefined();
    });

    it('should allow face_auth on face credential', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'test-id' }),
      });
      global.fetch = mockFetch;

      await expect(
        Session.create({
          app_id: 'app_test',
          action: 'test',
          requests: [{ type: Credential.Face, signal: 'test', face_auth: true }],
        })
      ).resolves.toBeDefined();
    });
  });

  describe('Verification Level Compatibility', () => {
    it('should convert orb verification level', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'test-id' }),
      });
      global.fetch = mockFetch;

      const session = await Session.fromVerificationLevel(
        'app_test',
        'test-action',
        'orb',
        'test-signal'
      );

      expect(session).toBeDefined();
      expect(mockFetch).toHaveBeenCalled();
    });

    it('should convert device verification level', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'test-id' }),
      });
      global.fetch = mockFetch;

      const session = await Session.fromVerificationLevel(
        'app_test',
        'test-action',
        'device',
        'test-signal'
      );

      expect(session).toBeDefined();
    });

    it('should reject unknown verification level', async () => {
      await expect(
        Session.fromVerificationLevel(
          'app_test',
          'test-action',
          'unknown' as any,
          'test-signal'
        )
      ).rejects.toThrow('Unknown verification level');
    });
  });

  describe('Connect URL Generation', () => {
    it('should generate valid connect URL', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'abc123' }),
      });
      global.fetch = mockFetch;

      const session = await Session.create({
        app_id: 'app_test',
        action: 'test',
        requests: [{ type: Credential.Orb, signal: 'test' }],
      });

      const url = session.connectUrl();
      
      expect(url).toContain('https://world.org/verify');
      expect(url).toContain('t=wld');
      expect(url).toContain('i=abc123');
      expect(url).toContain('k=');
    });

    it('should include bridge URL parameter when custom bridge', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'abc123' }),
      });
      global.fetch = mockFetch;

      const session = await Session.create({
        app_id: 'app_test',
        action: 'test',
        requests: [{ type: Credential.Orb, signal: 'test' }],
        bridge_url: 'https://custom-bridge.example.com',
      });

      const url = session.connectUrl();
      
      expect(url).toContain('b=');
      expect(url).toContain(encodeURIComponent('https://custom-bridge.example.com'));
    });

    it('should not include bridge URL parameter when using default', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ request_id: 'abc123' }),
      });
      global.fetch = mockFetch;

      const session = await Session.create({
        app_id: 'app_test',
        action: 'test',
        requests: [{ type: Credential.Orb, signal: 'test' }],
      });

      const url = session.connectUrl();
      
      expect(url).not.toContain('&b=');
    });
  });

  describe('Error Handling', () => {
    it('should handle bridge request failure', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Internal Server Error',
      });
      global.fetch = mockFetch;

      await expect(
        Session.create({
          app_id: 'app_test',
          action: 'test',
          requests: [{ type: Credential.Orb, signal: 'test' }],
        })
      ).rejects.toThrow('Bridge request failed');
    });

    it('should handle network errors', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = mockFetch;

      await expect(
        Session.create({
          app_id: 'app_test',
          action: 'test',
          requests: [{ type: Credential.Orb, signal: 'test' }],
        })
      ).rejects.toThrow();
    });
  });
});
