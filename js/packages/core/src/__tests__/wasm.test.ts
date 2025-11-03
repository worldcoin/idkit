import { describe, it, expect, beforeAll } from 'vitest';
import { initIDKit, isInitialized, WasmAppId, WasmRequest, WasmConstraints } from '../wasm-loader';
import { Credential } from '../types';

describe('WASM Integration', () => {
  describe('Initialization', () => {
    it('should initialize WASM module', async () => {
      await initIDKit();
      expect(isInitialized()).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await initIDKit();
      const firstInit = isInitialized();
      await initIDKit();
      const secondInit = isInitialized();
      
      expect(firstInit).toBe(true);
      expect(secondInit).toBe(true);
    });
  });

  describe('WasmAppId', () => {
    beforeAll(async () => {
      await initIDKit();
    });

    it('should create app ID', () => {
      const appId = new WasmAppId('app_test123');
      expect(appId).toBeDefined();
    });

    it('should detect staging app IDs', () => {
      const stagingAppId = new WasmAppId('app_staging_test');
      expect(stagingAppId.is_staging).toBe(true);
    });

    it('should detect non-staging app IDs', () => {
      const prodAppId = new WasmAppId('app_test123');
      expect(prodAppId.is_staging).toBe(false);
    });

    it('should convert to string', () => {
      const appId = new WasmAppId('app_test123');
      expect(appId.asString()).toBe('app_test123');
    });

    it('should reject invalid app IDs', () => {
      expect(() => new WasmAppId('invalid')).toThrow();
      expect(() => new WasmAppId('')).toThrow();
    });
  });

  describe('WasmRequest', () => {
    beforeAll(async () => {
      await initIDKit();
    });

    it('should create request', () => {
      const request = new WasmRequest(Credential.Orb, 'test-signal');
      expect(request).toBeDefined();
    });

    it('should add face auth', () => {
      const request = new WasmRequest(Credential.Orb, 'test-signal');
      const withFaceAuth = request.withFaceAuth(true);
      expect(withFaceAuth).toBeDefined();
    });

    it('should serialize to JSON', () => {
      const request = new WasmRequest(Credential.Orb, 'test-signal');
      const json = request.toJSON();
      expect(json).toBeDefined();
      expect(json.credential_type).toBe('orb');
      expect(json.signal).toBeDefined();
    });
  });

  describe('WasmConstraints', () => {
    beforeAll(async () => {
      await initIDKit();
    });

    it('should create simple constraint', () => {
      const constraints = new WasmConstraints(Credential.Orb);
      expect(constraints).toBeDefined();
    });

    it('should create ANY constraint', () => {
      const constraints = new WasmConstraints({
        any: [Credential.Orb, Credential.Face],
      });
      expect(constraints).toBeDefined();
    });

    it('should create ALL constraint', () => {
      const constraints = new WasmConstraints({
        all: [Credential.Orb, Credential.Document],
      });
      expect(constraints).toBeDefined();
    });

    it('should evaluate single credential constraint', () => {
      const constraints = new WasmConstraints(Credential.Orb);
      expect(constraints.evaluate([Credential.Orb])).toBe(true);
      expect(constraints.evaluate([Credential.Face])).toBe(false);
      expect(constraints.evaluate([])).toBe(false);
    });

    it('should evaluate ANY constraint', () => {
      const constraints = new WasmConstraints({
        any: [Credential.Orb, Credential.Face],
      });
      
      expect(constraints.evaluate([Credential.Orb])).toBe(true);
      expect(constraints.evaluate([Credential.Face])).toBe(true);
      expect(constraints.evaluate([Credential.Orb, Credential.Face])).toBe(true);
      expect(constraints.evaluate([Credential.Device])).toBe(false);
      expect(constraints.evaluate([])).toBe(false);
    });

    it('should evaluate ALL constraint', () => {
      const constraints = new WasmConstraints({
        all: [Credential.Orb, Credential.Document],
      });
      
      expect(constraints.evaluate([Credential.Orb, Credential.Document])).toBe(true);
      expect(constraints.evaluate([Credential.Orb])).toBe(false);
      expect(constraints.evaluate([Credential.Document])).toBe(false);
      expect(constraints.evaluate([])).toBe(false);
    });

    it('should evaluate nested constraints', () => {
      // (Orb OR Face) AND Document
      const constraints = new WasmConstraints({
        all: [
          { any: [Credential.Orb, Credential.Face] },
          Credential.Document,
        ],
      });
      
      expect(constraints.evaluate([Credential.Orb, Credential.Document])).toBe(true);
      expect(constraints.evaluate([Credential.Face, Credential.Document])).toBe(true);
      expect(constraints.evaluate([Credential.Orb, Credential.Face, Credential.Document])).toBe(true);
      expect(constraints.evaluate([Credential.Orb])).toBe(false);
      expect(constraints.evaluate([Credential.Document])).toBe(false);
      expect(constraints.evaluate([Credential.Device, Credential.Document])).toBe(false);
    });

    it('should find first satisfying credential for ANY', () => {
      const constraints = new WasmConstraints({
        any: [Credential.Orb, Credential.Face, Credential.Device],
      });
      
      const available = [Credential.Face, Credential.Device];
      const result = constraints.firstSatisfying(available);
      
      // Should return first in priority order (Orb, Face, Device)
      // Since Orb not available, should return Face
      expect(result).toBe(Credential.Face);
    });

    it('should return null when no credential satisfies', () => {
      const constraints = new WasmConstraints(Credential.Orb);
      const result = constraints.firstSatisfying([Credential.Face, Credential.Device]);
      expect(result).toBeNull();
    });
  });
});
