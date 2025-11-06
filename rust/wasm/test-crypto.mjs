/**
 * Quick test to verify WASM crypto functions work correctly
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import init, { BridgeEncryption, hashSignal, base64Encode, base64Decode } from '../../js/packages/core/wasm/idkit_wasm.js';

console.log('Testing WASM Crypto Functions...\n');

// Initialize WASM
console.log('Initializing WASM...');
const __dirname = dirname(fileURLToPath(import.meta.url));
const wasmPath = join(__dirname, '../../js/packages/core/wasm/idkit_wasm_bg.wasm');
const wasmBuffer = await readFile(wasmPath);
await init(wasmBuffer);
console.log('✓ WASM initialized\n');

// Test 1: BridgeEncryption
console.log('1. Testing BridgeEncryption...');
try {
  const encryption = new BridgeEncryption();
  console.log('✓ BridgeEncryption created');

  const keyB64 = encryption.keyBase64();
  const nonceB64 = encryption.nonceBase64();
  console.log(`✓ Key (base64): ${keyB64.substring(0, 20)}...`);
  console.log(`✓ Nonce (base64): ${nonceB64.substring(0, 20)}...`);

  // Test encrypt/decrypt
  const plaintext = 'Hello, World! This is a test message.';
  const encrypted = encryption.encrypt(plaintext);
  console.log(`✓ Encrypted: ${encrypted.substring(0, 30)}...`);

  const decrypted = encryption.decrypt(encrypted);
  console.log(`✓ Decrypted: ${decrypted}`);

  if (decrypted === plaintext) {
    console.log('✓ Encryption/decryption round-trip successful\n');
  } else {
    console.error('✗ Decrypted text does not match original\n');
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ BridgeEncryption test failed: ${e}\n`);
  process.exit(1);
}

// Test 2: Multiple encryption instances
console.log('2. Testing multiple encryption instances...');
try {
  const encryption1 = new BridgeEncryption();
  const encryption2 = new BridgeEncryption();
  console.log('✓ Created two independent encryption instances');

  const plaintext = 'Test message for independent instances';
  const encrypted1 = encryption1.encrypt(plaintext);
  const decrypted1 = encryption1.decrypt(encrypted1);

  const encrypted2 = encryption2.encrypt(plaintext);
  const decrypted2 = encryption2.decrypt(encrypted2);

  if (decrypted1 === plaintext && decrypted2 === plaintext && encrypted1 !== encrypted2) {
    console.log('✓ Each instance encrypts/decrypts independently with different keys\n');
  } else {
    console.error('✗ Independent encryption failed\n');
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ Multiple instances test failed: ${e}\n`);
  process.exit(1);
}

// Test 3: hashSignal
console.log('3. Testing hashSignal...');
try {
  const signal = 'test_signal_123';
  const hash = hashSignal(signal);
  console.log(`✓ Hash of "${signal}": ${hash}`);

  if (hash.startsWith('0x') && hash.length === 66) {
    console.log('✓ Hash format correct (0x + 64 hex chars)\n');
  } else {
    console.error('✗ Hash format incorrect\n');
    process.exit(1);
  }

  // Test consistency
  const hash2 = hashSignal(signal);
  if (hash === hash2) {
    console.log('✓ Hash is deterministic\n');
  } else {
    console.error('✗ Hash is not deterministic\n');
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ hashSignal test failed: ${e}\n`);
  process.exit(1);
}

// Test 4: base64 encode/decode
console.log('4. Testing base64 encode/decode...');
try {
  const data = new Uint8Array([1, 2, 3, 4, 5, 255, 254, 253]);
  const encoded = base64Encode(data);
  console.log(`✓ Encoded: ${encoded}`);

  const decoded = base64Decode(encoded);
  console.log(`✓ Decoded: ${Array.from(decoded).join(', ')}`);

  if (data.length === decoded.length && data.every((val, i) => val === decoded[i])) {
    console.log('✓ Base64 round-trip successful\n');
  } else {
    console.error('✗ Base64 round-trip failed\n');
    process.exit(1);
  }
} catch (e) {
  console.error(`✗ base64 test failed: ${e}\n`);
  process.exit(1);
}

console.log('✅ All WASM crypto tests passed!');
console.log('\nThe WASM crypto implementation is working correctly and can be used for:');
console.log('  - Bridge encryption (AES-256-GCM)');
console.log('  - Signal hashing (Keccak256)');
console.log('  - Base64 encoding/decoding');
console.log('\nNext steps: Integrate with JavaScript bridge client');
