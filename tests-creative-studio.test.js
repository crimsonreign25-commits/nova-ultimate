import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreview, generateImage } from './core/creative-studio.js';

test('preview creates a responsive starter and enhancement suggestions', () => {
  const out = createPreview({ name: '<NOVA Demo>', kind: 'app', description: 'A helpful app', style: 'ocean' });
  assert.equal(out.kind, 'app');
  assert.match(out.html, /&lt;NOVA Demo&gt;/);
  assert.match(out.html, /viewport/);
  assert.match(out.html, /#42d9d0/);
  assert.equal(out.files[0].path, 'index.html');
  assert.ok(out.suggestions.length >= 4);
});

test('image generation fails clearly when no provider is configured', async () => {
  const url = process.env.NOVA_IMAGE_API_URL;
  const key = process.env.NOVA_IMAGE_API_KEY;
  delete process.env.NOVA_IMAGE_API_URL;
  delete process.env.NOVA_IMAGE_API_KEY;
  try { await assert.rejects(() => generateImage({ prompt: 'a detailed image' }), { status: 503 }); }
  finally { if (url !== undefined) process.env.NOVA_IMAGE_API_URL = url; if (key !== undefined) process.env.NOVA_IMAGE_API_KEY = key; }
});
