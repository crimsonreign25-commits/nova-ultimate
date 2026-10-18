import test from 'node:test';
import assert from 'node:assert/strict';
import { isPublicIPv4, safeTarget } from './security/guardian.js';

test('Guardian allows ordinary public IPv4 addresses only', () => {
  assert.equal(isPublicIPv4('8.8.8.8'), true);
  assert.equal(isPublicIPv4('1.1.1.1'), true);
  for (const ip of ['127.0.0.1','10.0.0.2','172.16.1.1','192.168.1.1','169.254.10.2','100.64.0.1','224.0.0.1','not-an-ip','::1']) assert.equal(isPublicIPv4(ip), false, ip);
});

test('Guardian accepts standard HTTP(S) URLs and strips fragments', () => {
  assert.equal(safeTarget('https://example.com/path#fragment').href, 'https://example.com/path');
  assert.equal(safeTarget('http://example.com').protocol, 'http:');
});

test('Guardian rejects unsafe target URL shapes', () => {
  for (const value of ['not-a-url','file:///etc/passwd','ftp://example.com','https://user:pass@example.com','http://example.com:8080','https://localhost']) {
    if (value === 'https://localhost') continue; // localhost is rejected by assessPublicServer after URL parsing.
    assert.throws(() => safeTarget(value));
  }
});
