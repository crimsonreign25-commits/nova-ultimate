import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html=readFileSync(new URL('./public/index.html',import.meta.url),'utf8');
const css=readFileSync(new URL('./public/styles.css',import.meta.url),'utf8');
const app=readFileSync(new URL('./public/app.js',import.meta.url),'utf8');

test('Voice navigation opens a dedicated accessible Voice Studio',()=>{
  assert.match(html,/id="voiceWorkspace"[^>]*aria-label="NOVA Voice Studio"/);
  assert.match(html,/id="voiceBackButton"/);
  assert.match(html,/id="voiceTranscript"/);
  assert.match(app,/function openVoiceStudio\(/);
  assert.match(app,/function closeVoiceStudio\(/);
  assert.match(app,/btn\.dataset\.target==='voiceWorkspace'/);
});
test('Voice Studio exposes native voice choice, rate, captions and stop control',()=>{
  for(const id of ['voiceChoice','voiceRate','voiceCaptionsToggle','voiceStopButton','voiceCameraButton']) assert.ok(html.includes(`id="${id}"`),`missing ${id}`);
  assert.match(app,/populateDeviceVoices/);
  assert.match(app,/function stopVoicePlayback\(/);
  assert.match(app,/activeSpeechCancel/);
});
test('All six persona holograms have distinct visual selectors and ORION sentinel geometry',()=>{
  for(const key of ['nova','jarvis','friday','atlas','lyra','orion']) assert.ok(css.includes(`.persona-${key} .holo-core`),`missing hologram geometry for ${key}`);
  assert.match(css,/\.persona-orion \.holo-core\{[^}]*clip-path/);
});
test('Camera gracefully handles unsupported permissions and attaches captures',()=>{
  assert.match(app,/navigator\.mediaDevices\?\.getUserMedia/);
  assert.match(app,/NotAllowedError/);
  assert.match(app,/NotFoundError/);
  assert.match(app,/addFiles\(\[new File\(\[blob\]/);
  assert.match(app,/cameraStream\?\.getTracks\(\)\.forEach/);
});
test('Versioned cache uses the current Voice Studio assets',()=>{
  const sw=readFileSync(new URL('./public/sw.js',import.meta.url),'utf8');
  assert.match(html,/21\.5\.0-encrypted-router/);
  assert.match(sw,/nova-v21\.5\.0-encrypted-router/);
  assert.match(sw,/styles\.css\?v=21\.5\.0-encrypted-router/);
  assert.match(sw,/app\.js\?v=21\.5\.0-encrypted-router/);
});
