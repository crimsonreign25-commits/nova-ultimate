import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('./public/app.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('./public/index.html', import.meta.url), 'utf8');

test('chat composer exposes an accessible message box and send control', () => {
  assert.match(html, /<form id="assistantForm"[^>]*>/);
  assert.match(html, /<textarea id="messageInput"[^>]*>/);
  assert.match(html, /<button type="submit" id="sendButton"[^>]*aria-label="Send message to NOVA"/);
  assert.match(app, /\$\('assistantForm'\)\.addEventListener\('submit'/);
  assert.match(app, /\$\('messageInput'\)\.addEventListener\('input',updateSendButtonState\)/);
});

test('send control is disabled for empty input and while a request is pending', () => {
  assert.match(app, /button\.disabled=isSendingMessage\|\|\(!input\.value\.trim\(\)&&!selectedAttachments\.length\)/);
  assert.match(app, /if\(isSendingMessage\)return/);
  assert.match(app, /finally\{isSendingMessage=false;setThinking\(false\);renderHistory\(\);await saveState\(\);updateSendButtonState\(\);\}/);
});

test('assistant errors are displayed and saved to the current conversation', () => {
  assert.match(app, /const errorText=`I couldn't complete that request:/);
  assert.match(app, /currentConversation\.messages\.push\(\{role:'nova',text:errorText,at:Date\.now\(\)\}\)/);
  assert.match(app, /addChatMessage\('nova',errorText\)/);
});

test('camera capture reports attachment-limit failures honestly', () => {
  assert.match(app, /const attached=addFiles\(\[new File\(\[blob\]/);
  assert.match(app, /Photo captured, but NOVA already has 5 attachments or the image could not be added/);
});


test('server maps all six personas to distinct assistant instructions', () => {
  const server = readFileSync(new URL('./index.js', import.meta.url), 'utf8');
  for (const persona of ['nova', 'jarvis', 'friday', 'atlas', 'lyra', 'orion']) {
    assert.match(server, new RegExp(`\\b${persona}: 'You are ${persona.toUpperCase()}`));
  }
  assert.match(server, /\['nova', 'jarvis', 'friday', 'atlas', 'lyra', 'orion'\]\.includes/);
});
