import test from 'node:test';
import assert from 'node:assert/strict';
import { artifactId, artifactReadPath } from '../src/api.js';

const shortId = '1111111111111111111112';
const uuid = '00000000-0000-0000-0000-000000000001';
const shareKey = 'synthetic_share_key_1234';

test('artifact IDs accept UUIDs and decode Bitcoin Base58 short IDs', () => {
  assert.equal(artifactId('2ABFFAAA-149C-4A0A-A40B-F998CC4D2BD8'), '2abffaaa-149c-4a0a-a40b-f998cc4d2bd8');
  assert.equal(artifactId(shortId), uuid);
  assert.equal(artifactId('6HBMyHYyhDL6hCKmYD8vmu'), '2abffaaa-149c-4a0a-a40b-f998cc4d2bd8');
});

test('artifact URLs accept chat and code routes with short IDs or UUIDs', () => {
  for (const route of ['artifact', 'code/artifact']) {
    for (const id of [shortId, uuid]) {
      assert.equal(artifactId(`https://claude.ai/${route}/${id}`), uuid);
      assert.equal(artifactId(`https://claude.ai/${route}/${id}/?sk=${shareKey}`), uuid);
    }
  }
});

test('read paths preserve share keys before optional version selectors', () => {
  const url = `https://claude.ai/artifact/${shortId}?sk=${shareKey}`;
  assert.equal(artifactReadPath(uuid), `/api/frame/${uuid}`);
  assert.equal(artifactReadPath(shortId, 'v123'), `/api/frame/${uuid}?ver=v123`);
  assert.equal(artifactReadPath(url), `/api/frame/${uuid}?sk=${shareKey}`);
  assert.equal(artifactReadPath(url, 'v123'), `/api/frame/${uuid}?sk=${shareKey}&ver=v123`);
});

test('artifact URLs reject unrelated hosts, insecure transport, ports and credentials', () => {
  const invalid = [
    `http://claude.ai/artifact/${shortId}`,
    `https://example.com/artifact/${shortId}`,
    `https://claude.ai.example.com/artifact/${shortId}`,
    `https://claude.ai:8443/artifact/${shortId}`,
    `https://user@claude.ai/artifact/${shortId}`,
    `https://user:password@claude.ai/artifact/${shortId}`,
    `https://claude.ai/chat/${shortId}`,
    `https://claude.ai/artifact/${shortId}/extra`,
  ];
  for (const value of invalid) {
    assert.throws(() => artifactId(value), value);
    assert.throws(() => artifactReadPath(value), value);
  }
});

test('short artifact IDs reject invalid alphabet, lengths and 128-bit overflow', () => {
  for (const value of ['1'.repeat(21), '1'.repeat(23), 'z'.repeat(22), '0'.repeat(22), 'I'.repeat(22)]) {
    assert.throws(() => artifactId(value), value);
    assert.throws(() => artifactReadPath(`https://claude.ai/artifact/${value}`), value);
  }
});

test('read paths reject malformed share keys instead of dropping or forwarding them', () => {
  for (const key of ['', 'short', 'x'.repeat(65), 'invalid/key_123456', 'invalid key_123456']) {
    const url = `https://claude.ai/artifact/${shortId}?sk=${encodeURIComponent(key)}`;
    assert.throws(() => artifactReadPath(url), `share key ${JSON.stringify(key)}`);
  }
});
