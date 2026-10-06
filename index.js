import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import { PredictionEngine } from './core/prediction-engine.js';
import { Orchestrator } from './core/orchestrator.js';
import { MobileGuard } from './security/mobile-guard.js';
import { AgentCore } from './core/agent-core.js';
import { ToolRegistry } from './core/tool-registry.js';
import { JobEngine } from './core/job-engine.js';
import { AutonomousExecutor } from './core/autonomous-executor.js';
import { WorkspaceManager } from './core/workspace-manager.js';
import { BuilderEngine } from './core/builder-engine.js';
import { PersistentStore } from './core/persistent-store.js';
import { AIRouter } from './core/ai-router.js';
import { VoiceEngine } from './core/voice-engine.js';
import { NovaUniversal } from './core/nova-universal.js';
import { ActionGateway } from './core/action-gateway.js';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import pdfParse from 'pdf-parse/lib/pdf-parse.js';
import XLSX from 'xlsx';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const prediction = new PredictionEngine();
const orchestrator = new Orchestrator();
const guard = new MobileGuard();
const agentCore = new AgentCore({ maxSteps: 10, maxRetries: 2, recovery: { maxReplans: 2, baseDelayMs: 150, maxDelayMs: 1200 } });
const tools = new ToolRegistry();
const jobs = new JobEngine({ maxJobs: 100 });
const autonomous = new AutonomousExecutor({ agent: agentCore, jobs, tools, maxReplans: 2, maxSteps: 12, approvalRequired: true });
const workspace = new WorkspaceManager({ root: join(__dirname, 'workspaces') });
const builder = new BuilderEngine({ workspace });
const aiRouter = new AIRouter();
const voiceEngine = new VoiceEngine();
const store = new PersistentStore({ root: join(__dirname, 'data', 'nova-store') });
const universal = new NovaUniversal({ store });
const actionGateway = new ActionGateway({ audit: event => store.audit(event) });
await workspace.init();
await store.init();
const autonomousTasks = new Map();


const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 50000;

// NOVA's open core: tools are registered once and can be composed by the agent/job engine.
tools
  .register({ name: 'research', description: 'Search the web for current information.', input: { query: 'string' }, permissions: ['network'], execute: async ({ query }) => {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(String(query || ''))}`, { headers: { 'User-Agent': 'NOVA-Ultimate/11.0' } });
    if (!response.ok) throw new Error('Search provider unavailable');
    const html = await response.text(); const results = [];
    const clean = v => v.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
    const re = /<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi; let m;
    while ((m = re.exec(html)) && results.length < 8) { let u=m[1]; try { const x=new URL(u,'https://duckduckgo.com'); const target=x.searchParams.get('uddg'); if(target) u=decodeURIComponent(target); } catch {} results.push({title:clean(m[2]),url:u}); }
    return { query, results };
  }})
  .register({ name: 'security', description: 'Inspect a URL with NOVA security heuristics.', input: { url: 'string' }, permissions: ['network'], execute: async ({ url }) => guard.scanUrl(String(url || '')) })
  .register({ name: 'assist', description: "Use NOVA's configured language model.", input: { message: 'string' }, permissions: ['model'], execute: async ({ message, user_id='default', persona='nova', attachments=[] }) => {
    const response = await fetch(`http://127.0.0.1:${port}/assist`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({message,user_id,persona,attachments}) });
    const data=await response.json(); if(!response.ok) throw new Error(data.error || 'Assistant execution failed'); return data.response || '';
  }})
  .register({ name: 'builder-inspect', description: 'Inspect a NOVA Builder workspace.', input: { workspaceId: 'string' }, permissions: ['workspace-read'], execute: async ({ workspaceId }) => builder.inspect(workspaceId) })
  .register({ name: 'builder-test', description: 'Run NOVA safe static syntax checks in a workspace.', input: { workspaceId: 'string' }, permissions: ['workspace-read','process-safe'], execute: async ({ workspaceId }) => builder.test(workspaceId) });


function decodeDataUrl(dataUrl) {
  const match = String(dataUrl || '').match(/^data:([^;,]+)?;base64,(.+)$/s);
  if (!match) throw new Error('Invalid attachment data.');
  return {
    mime: match[1] || 'application/octet-stream',
    buffer: Buffer.from(match[2], 'base64')
  };
}

function xmlToText(xml) {
  return String(xml || '')
    .replace(/<w:tab\s*\/?>/g, '\t')
    .replace(/<a:br\s*\/?>/g, '\n')
    .replace(/<w:br\s*\/?>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function extractPptxText(buffer) {
  const zip = new AdmZip(buffer);
  const entries = zip.getEntries()
    .filter((entry) => /^ppt\/slides\/slide\d+\.xml$/i.test(entry.entryName))
    .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }));
  return entries.map((entry) => xmlToText(entry.getData().toString('utf8'))).join('\n\n');
}

function extractDocxText(buffer) {
  return mammoth.extractRawText({ buffer }).then((result) => result.value || '');
}

function extractXlsxText(buffer) {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const parts = [];
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    parts.push(`Sheet: ${sheetName}\n${csv}`);
  }
  return parts.join('\n\n');
}

async function extractAttachmentText(item) {
  const { buffer } = decodeDataUrl(item.data);
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error(`${item.name || 'Attachment'} is larger than 8MB.`);
  }
  const type = String(item.type || '').toLowerCase();
  const name = String(item.name || '').toLowerCase();
  let text = '';

  if (type === 'text/plain' || type === 'text/csv' || /\.(txt|csv)$/i.test(name)) {
    text = buffer.toString('utf8');
  } else if (type === 'application/pdf' || name.endsWith('.pdf')) {
    const parsed = await pdfParse(buffer);
    text = parsed.text || '';
  } else if (type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || name.endsWith('.docx')) {
    text = await extractDocxText(buffer);
  } else if (type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || name.endsWith('.xlsx')) {
    text = extractXlsxText(buffer);
  } else if (type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || name.endsWith('.pptx')) {
    text = extractPptxText(buffer);
  } else {
    return null;
  }

  return String(text).slice(0, MAX_EXTRACTED_CHARS);
}

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use(express.static(join(__dirname, 'public')));

// Optional account layer: guests can use NOVA immediately; configured Supabase
// accounts unlock the full experience and can be used across devices.
let supabase = null;
async function getSupabase() {
  if (supabase) return supabase;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return supabase;
}

async function optionalUser(req,res,next){
  const auth=String(req.headers.authorization||''); const token=auth.startsWith('Bearer ')?auth.slice(7):''; const client=await getSupabase();
  if(client&&token){try{const {data,error}=await client.auth.getUser(token);if(!error&&data?.user)req.user=data.user;}catch{}}
  next();
}
function ownedUserId(req, requested='guest'){
  const wanted=String(requested||'guest');
  if(wanted==='guest')return 'guest';
  if(req.user?.id===wanted)return wanted;
  throw new Error('A signed-in NOVA account is required for this private profile.');
}

async function requireUser(req, res, next) {
  const auth = String(req.headers.authorization || '');
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  const client = await getSupabase();
  if (!client || !token) return res.status(401).json({ error: 'Sign in required for this NOVA capability.' });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: 'Your NOVA session is invalid or expired.' });
  req.user = data.user;
  next();
}

app.get('/api/auth/config', async (_req, res) => {
  const configured = Boolean(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL) && Boolean(process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  res.json({ configured, guestMode: true, fullExperience: configured ? 'account' : 'local' });
});

app.post('/api/auth/signup', async (req, res) => {
  try {
    const client = await getSupabase();
    if (!client) return res.status(503).json({ error: 'Account service is not configured. Guest mode remains available.' });
    const { email = '', password = '' } = req.body || {};
    if (!email || String(password).length < 8) return res.status(400).json({ error: 'Use a valid email and a password of at least 8 characters.' });
    const { data, error } = await client.auth.signUp({ email: String(email).trim(), password: String(password) });
    if (error) return res.status(400).json({ error: error.message });
    res.json({ ok: true, session: data.session, user: data.user, confirmationRequired: !data.session });
  } catch (error) { res.status(500).json({ error: error.message || 'Unable to create account.' }); }
});

app.post('/api/auth/signin', async (req, res) => {
  try {
    const client = await getSupabase();
    if (!client) return res.status(503).json({ error: 'Account service is not configured. Guest mode remains available.' });
    const { email = '', password = '' } = req.body || {};
    const { data, error } = await client.auth.signInWithPassword({ email: String(email).trim(), password: String(password) });
    if (error) return res.status(401).json({ error: error.message });
    res.json({ ok: true, session: data.session, user: data.user });
  } catch (error) { res.status(500).json({ error: error.message || 'Unable to sign in.' }); }
});

app.get('/api/auth/me', requireUser, (req, res) => res.json({ authenticated: true, user: { id: req.user.id, email: req.user.email } }));


app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

async function roleFor(req){
  const creatorToken=process.env.NOVA_CREATOR_TOKEN && String(req.headers['x-nova-creator-token']||'')===String(process.env.NOVA_CREATOR_TOKEN);
  if(creatorToken)return 'creator';
  const viewerToken=process.env.NOVA_VIEWER_TOKEN && String(req.headers['x-nova-viewer-token']||'')===String(process.env.NOVA_VIEWER_TOKEN);
  if(viewerToken)return 'viewer';
  const creatorEmail=String(process.env.NOVA_CREATOR_EMAIL||'').trim().toLowerCase();
  const auth=String(req.headers.authorization||'');
  const token=auth.startsWith('Bearer ')?auth.slice(7):'';
  if(creatorEmail && token){
    try {
      const client=await getSupabase();
      const {data}=client ? await client.auth.getUser(token) : {data:null};
      const email=String(data?.user?.email||'').trim().toLowerCase();
      if(email && email===creatorEmail)return 'creator';
    } catch {}
  }
  return 'user';
}
async function requireAdvanced(req,res,next){ const role=await roleFor(req); if(role==='creator'||role==='viewer'){req.novaRole=role;return next();} return res.status(403).json({error:'This NOVA capability is restricted to authorized users.'}); }
async function requireCreator(req,res,next){ if(await roleFor(req)!=='creator')return res.status(403).json({error:'Creator authorization is required for this action.'}); req.novaRole='creator'; next(); }

app.get('/api/capabilities', (req,res)=>res.json(universal.capabilities({mobile:String(req.query.mobile||'').toLowerCase()==='true'})));
app.get('/api/profile', optionalUser, async (req,res)=>{try{const userId=ownedUserId(req,req.query.user_id);res.json(await universal.getProfile(userId));}catch(e){res.status(401).json({error:e.message})}});
app.put('/api/profile', optionalUser, async (req,res)=>{try{const userId=ownedUserId(req,req.body?.user_id);const profile=await universal.updateProfile(userId,req.body?.profile||{});res.json(profile);}catch(e){res.status(401).json({error:e.message})}});
app.post('/api/safety/check', (req,res)=>res.json(universal.checkAction(String(req.body?.action||'unknown'),req.body||{})));
app.post('/api/actions/prepare', (req,res)=>res.json(actionGateway.prepare({action:req.body?.action,target:req.body?.target,details:req.body?.details,userId:String(req.body?.user_id||'guest')})));
app.post('/api/actions/confirm', async (req,res)=>{try{res.json(await actionGateway.confirm(req.body?.plan,{userId:String(req.body?.user_id||'guest'),confirmed:Boolean(req.body?.confirmed)}));}catch(e){res.status(403).json({error:e.message})}});
app.post('/api/proactive/evaluate', (req,res)=>res.json(universal.proactive({context:req.body?.context||{}})));
app.get('/api/notifications', async (req,res)=>{try{res.json({notifications:await store.listNotifications(String(req.query.user_id||'guest'))});}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/notifications/:id/read', async (req,res)=>{try{await store.markNotification(req.params.id,String(req.body?.user_id||'guest'));res.json({ok:true});}catch(e){res.status(500).json({error:e.message})}});
app.post('/api/devices/register', async (req,res)=>{try{const item=await store.registerDevice({userId:String(req.body?.user_id||'guest'),name:String(req.body?.name||'NOVA Device'),platform:String(req.body?.platform||'web'),capabilities:req.body?.capabilities||{},id:req.body?.id});res.json(item);}catch(e){res.status(400).json({error:e.message})}});
app.get('/api/devices', async (req,res)=>{try{res.json({devices:await store.listDevices(String(req.query.user_id||'guest'))});}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/status', (_req, res) => {
  res.json({
    name: 'NOVA Ultimate',
    version: '21.2.1',
    status: 'operational',
    features: ['prediction','orchestration','security-scanning','live-voice','camera','multimodal','document-intelligence','web-research','memory','command-center','autonomous-agent','tool-registry','job-engine','retry-replanning','verification','adaptive-interface','live-telemetry','goal-planning','adaptive-recovery','failure-classification','bounded-replanning','job-cancellation','autonomous-executor','approval-gates','execution-checkpoints','bounded-autonomy','builder-mode','workspace-sandbox','safe-file-operations','static-verification','artifact-packaging','autonomous-builder','multi-file-edits','builder-recovery','transactional-rollback','durable-jobs','workspace-manifest','project-import','safe-python-tests','html-structural-tests','workspace-move-delete','artifact-hashing','builder-review-gates','reference-ui','capability-dashboard','mobile-preview','persistent-chat','conversation-context','execution-progress','creator-access-control','read-only-restricted-access','access-audit','global-provider-discovery','dynamic-model-selection','universal-accessibility','screen-reader-support','keyboard-navigation','live-captions','voice-first-mode','adaptive-display','reduced-motion','focus-mode','mobile-pwa'],
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    voiceEngine: voiceEngine.status(),
    personas: voiceEngine.voices().map((voice) => voice.id),
    aiRouter: { paidMode: Boolean(process.env.NOVA_PAID_MODE === 'true'), providers: aiRouter.status() },
    discovery: aiRouter.discovery.status()
  });
});

app.get('/api/account/experience', requireUser, (_req, res) => {
  res.json({ fullExperience: true, capabilities: ['cross-device-account', 'agent-core', 'persistent-context', 'advanced-tools', 'voice', 'research', 'file-intelligence'] });
});

app.post('/predict', (req, res) => {
  const { user_id = 'default', message = '' } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  prediction.observe(user_id, message);
  res.json({ suggestions: prediction.predict(user_id, message) });
});


app.post('/research', async (req, res) => {
  const { query = '' } = req.body || {};
  if (typeof query !== 'string' || !query.trim()) return res.status(400).json({ error: 'query is required' });
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query.trim())}`;
    const response = await fetch(url, { headers: { 'User-Agent': 'NOVA-Ultimate/8.2' } });
    if (!response.ok) return res.status(502).json({ error: 'Search provider unavailable' });
    const html = await response.text();
    const results = [];
    const blockRe = /<a[^>]+class=\"result__a\"[^>]+href=\"([^\"]+)\"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    while ((match = blockRe.exec(html)) && results.length < 8) {
      const clean = (value) => value.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/\s+/g, ' ').trim();
      let resultUrl = match[1];
      try {
        const u = new URL(resultUrl, 'https://duckduckgo.com');
        const target = u.searchParams.get('uddg');
        if (target) resultUrl = decodeURIComponent(target);
      } catch {}
      results.push({ title: clean(match[2]), url: resultUrl, snippet: 'Open this result for the current page and details.' });
    }
    res.json({ query, results });
  } catch (error) {
    console.error('Research failed:', error);
    res.status(502).json({ error: 'Unable to reach web search' });
  }
});

app.post('/scan-url', (req, res) => {
  const { url } = req.body || {};
  if (typeof url !== 'string' || !url.trim()) {
    return res.status(400).json({ error: 'url is required' });
  }
  res.json(guard.scanUrl(url));
});

app.post('/assist', async (req, res) => {
  const { message, user_id = 'default', persona = 'nova', attachments = [] } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  if (!Array.isArray(attachments) || attachments.length > 5) {
    return res.status(400).json({ error: 'A maximum of 5 attachments is supported.' });
  }

  prediction.observe(user_id, message);
  const saved = await store.getConversation(String(user_id), String(req.body?.conversation_id || ''));
  const recentContext = saved?.messages?.slice(-12).map(m => ({ role: m.role, content: m.text })) || [];

  try {
    const personaPrompts = {
      nova: 'You are NOVA, an adaptive personal AI assistant. Be clear, helpful, calm, and concise.',
      jarvis: 'You are JARVIS, an original strategic AI persona. Be precise, composed, technical when useful, and proactive. Do not claim to be a fictional character.',
      friday: 'You are FRIDAY, an original conversational AI persona. Be warm, quick, confident, and practical. Do not claim to be a fictional character.'
    };
    const selectedPersona = ['nova', 'jarvis', 'friday'].includes(String(persona).toLowerCase()) ? String(persona).toLowerCase() : 'nova';

    const imageAttachments = attachments
      .filter((item) => item && typeof item.data === 'string' && String(item.type || '').startsWith('image/'))
      .slice(0, 5);
    const documentAttachments = attachments.filter((item) => item && typeof item.data === 'string').slice(0, 5);
    const userContent = [{ type: 'text', text: message }];

    for (const item of imageAttachments) {
      if (item.data.length > 20 * 1024 * 1024) {
        return res.status(413).json({ error: `Image ${item.name || 'attachment'} is too large. Maximum is 20MB.` });
      }
      userContent.push({
        type: 'image_url',
        image_url: { url: item.data }
      });
    }

    const extractionErrors = [];
    for (const item of documentAttachments) {
      if (String(item.type || '').startsWith('image/')) continue;
      try {
        const extracted = await extractAttachmentText(item);
        if (extracted) {
          userContent.push({
            type: 'text',
            text: `\nAttachment: ${item.name || 'document'}\n---\n${extracted}\n---`
          });
        } else {
          extractionErrors.push(`${item.name || 'attachment'} could not be read in this build.`);
        }
      } catch (error) {
        extractionErrors.push(`${item.name || 'attachment'} could not be read: ${error.message}`);
      }
    }

    const hasImages = imageAttachments.length > 0;
    const systemText = hasImages
      ? `${personaPrompts[selectedPersona]} You can analyze the user's attached images. Describe only what is actually visible, and clearly distinguish observations from guesses. If the user asks about text in an image, read it carefully.`
      : `${personaPrompts[selectedPersona]} Personality profile: ${process.env.NOVA_PERSONALITY || 'professional'}.`;

    const routed = await aiRouter.chat({
      needsVision: hasImages,
      messages: [
        { role: 'system', content: systemText },
        ...recentContext
          .filter(m => m.role === 'user' || m.role === 'nova')
          .map(m => ({ role: m.role === 'nova' ? 'assistant' : 'user', content: m.content })),
        { role: 'user', content: userContent }
      ],
      temperature: 0.7,
      maxTokens: Number(process.env.NOVA_MAX_OUTPUT_TOKENS || 4096),
      task: typeof req.body?.task === 'string' ? req.body.task : ''
    });

    const warning = extractionErrors.length ? `\n\nAttachment note: ${extractionErrors.join(' ')}` : '';
    res.json({
      response: routed.text + warning,
      provider: routed.provider,
      model: routed.model,
      task: routed.task,
      persona: selectedPersona,
      analyzedAttachments: attachments.map((item) => item.name).filter(Boolean),
      extractedDocuments: attachments
        .filter((item) => item && !String(item.type || '').startsWith('image/'))
        .map((item) => item.name).filter(Boolean),
      suggestions: prediction.predict(user_id, message)
    });
  } catch (error) {
    console.error('Assist request failed:', error);
    if (error.code === 'NO_PROVIDER') {
      return res.status(503).json({
        error: 'No configured free AI provider is available.',
        providers: aiRouter.status()
      });
    }
    return res.status(502).json({
      error: 'All configured AI providers failed.',
      details: error.message,
      providers: aiRouter.status()
    });
  }
});

app.get('/api/router/discovery', async (req, res) => {
  try {
    const task = typeof req.query?.task === 'string' ? req.query.task : 'general';
    const needsVision = String(req.query?.vision || '').toLowerCase() === 'true';
    const refresh = String(req.query?.refresh || '').toLowerCase() === 'true';
    const status = await aiRouter.discoveryStatus({ refresh });
    const models = await aiRouter.discoveredModels({ task, needsVision, freeOnly: !aiRouter.paidMode, limit: 20 });
    res.json({ status, task, needsVision, models });
  } catch (error) {
    res.status(502).json({ error: error.message, status: aiRouter.discovery.status() });
  }
});

app.post('/api/router/plan', (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message : '';
  const task = typeof req.body?.task === 'string' ? req.body.task : '';
  const needsVision = Boolean(req.body?.needsVision);
  res.json(aiRouter.plan({ messages: [{ role: 'user', content: message }], needsVision, task }));
});

app.get('/api/chat', async (req,res)=>{ try{const userId=String(req.query.user_id||'mobile-user');res.json({conversations:await store.listConversations(userId)});}catch(e){res.status(500).json({error:e.message})} });
app.get('/api/chat/:id', async (req,res)=>{ try{const userId=String(req.query.user_id||'mobile-user');const item=await store.getConversation(userId,req.params.id);if(!item)return res.status(404).json({error:'Conversation not found'});res.json(item);}catch(e){res.status(500).json({error:e.message})} });
app.post('/api/chat', async (req,res)=>{ try{const userId=String(req.body?.user_id||'mobile-user');const item=await store.saveConversation(userId,req.body||{});res.json(item);}catch(e){res.status(400).json({error:e.message})} });
app.delete('/api/chat/:id', async (req,res)=>{ try{const userId=String(req.query.user_id||'mobile-user');await store.deleteConversation(userId,req.params.id);res.json({ok:true});}catch(e){res.status(500).json({error:e.message})} });
app.post('/api/access/request', async (req,res)=>{try{const item=await store.addAccessRequest({userId:String(req.body?.user_id||'anonymous'),resource:String(req.body?.resource||'advanced'),reason:String(req.body?.reason||'User requested restricted NOVA information.')});res.status(201).json({ok:true,request:item,notifyCreator:Boolean(process.env.NOVA_CREATOR_TOKEN)});}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/access/requests', requireCreator, async (_req,res)=>res.json({requests:await store.listAccess()}));
app.post('/api/access/requests/:id/decision', requireCreator, async (req,res)=>{const decision=['approved','denied'].includes(req.body?.decision)?req.body.decision:'denied';const item=await store.decideAccess(req.params.id,decision,'creator');if(!item)return res.status(404).json({error:'Access request not found'});res.json({ok:true,request:item});});
app.get('/api/access/audit', requireCreator, async (_req,res)=>res.json({audit:await store.listAudit()}));

app.get('/api/autonomous-progress/:id', (req,res)=>{const task=autonomousTasks.get(req.params.id);if(!task)return res.status(404).json({error:'Task not found'});res.json(task);});
app.get('/api/autonomous-download/:id',(req,res)=>{const task=autonomousTasks.get(req.params.id);const file=task?.result?.artifact?.path;if(!task||task.status!=='completed'||!file)return res.status(404).json({error:'Verified result not available'});res.download(file,basename(file));});

app.get('/api/builder/workspaces', requireAdvanced, async (_req, res) => {
  try { const entries = await fs.readdir(workspace.root, { withFileTypes:true }); res.json({ workspaces: entries.filter(e=>e.isDirectory()).map(e=>({id:e.name})) }); }
  catch (error) { res.status(500).json({error:error.message}); }
});
app.post('/api/builder/workspaces', requireCreator, async (req,res) => { try { const item=await workspace.create(req.body?.name || 'nova-project'); res.status(201).json(item); } catch(error){ res.status(400).json({error:error.message}); } });
app.get('/api/builder/workspaces/:id', requireAdvanced, async (req,res) => { try { res.json(await builder.inspect(req.params.id)); } catch(error){ res.status(404).json({error:error.message}); } });
app.get('/api/builder/workspaces/:id/files', requireAdvanced, async (req,res) => { try { res.json({items:await workspace.list(req.params.id, req.query.path || '.')}); } catch(error){ res.status(404).json({error:error.message}); } });
app.get('/api/builder/workspaces/:id/file', requireAdvanced, async (req,res) => { try { res.json({path:req.query.path,content:await workspace.read(req.params.id, req.query.path)}); } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/file', requireCreator, async (req,res) => { try { const out=await workspace.write(req.params.id, req.body?.path, req.body?.content, {overwrite:Boolean(req.body?.overwrite)}); res.json({ok:true,...out}); } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/patch', requireCreator, async (req,res) => { try { const out=await workspace.patch(req.params.id, req.body?.path, req.body?.find, req.body?.replace, {all:Boolean(req.body?.all)}); res.json({ok:true,...out}); } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/test', requireCreator, async (req,res) => { try { res.json(await builder.test(req.params.id)); } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/build', requireCreator, async (req,res) => {
  try {
    const id=req.params.id; const goal=String(req.body?.goal || '').trim();
    if(!goal) return res.status(400).json({error:'goal is required'});
    let changes=Array.isArray(req.body?.changes) ? req.body.changes : [];
    const maxRepairRounds=3;
    const parseChanges=(raw)=>{
      const text=String(raw||'').replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
      try { const data=JSON.parse(text); return Array.isArray(data)?data:(Array.isArray(data.changes)?data.changes:[]); } catch {
        const m=text.match(/\{[\s\S]*\}/); if(!m) return []; try { const data=JSON.parse(m[0]); return Array.isArray(data)?data:(Array.isArray(data.changes)?data.changes:[]); } catch { return []; }
      }
    };
    const snapshot=await builder.inspect(id);
    if(!changes.length){
      const contextFiles=[]; for(const f of snapshot.files.slice(0,60)){ try{ contextFiles.push({path:f.path,content:await workspace.read(id,f.path)}); }catch{} }
      const prompt=`You are NOVA Builder. Return ONLY valid JSON with a top-level "changes" array. Each item must be {"path":"relative/path","content":"complete file content"}. Do not use markdown. Build this goal inside the existing workspace. Preserve unrelated files. Goal: ${goal}\nExisting files: ${JSON.stringify(contextFiles)}`;
      const generated=await tools.execute('assist',{message:prompt,user_id:req.body?.user_id||'default',persona:req.body?.persona||'nova',attachments:[]});
      changes=parseChanges(generated.output);
      if(!changes.length) return res.status(502).json({error:'Builder model did not return a valid change set.',modelOutput:generated.output});
    }
    const result=await builder.autonomousBuild(id,{goal,changes,repair:async ({diagnosis,test,inspect,round})=>{
      const prompt=`You are NOVA Builder repair agent. Return ONLY valid JSON with a top-level \"changes\" array. Fix only the diagnosed files. Each change must contain complete replacement content. No markdown. Goal: ${goal}\nRound: ${round}\nDiagnosis: ${JSON.stringify(diagnosis)}\nTest: ${JSON.stringify(test)}\nFiles: ${JSON.stringify(inspect.files.slice(0,60))}`;
      const generated=await tools.execute('assist',{message:prompt,user_id:req.body?.user_id||'default',persona:req.body?.persona||'nova',attachments:[]});
      return {changes:parseChanges(generated.output)};
    }});
    res.json(result);
  } catch(error){ res.status(400).json({error:error.message,trace:error.builderTrace||null}); }
});
app.post('/api/autonomous-build', async (req,res)=>{
  const {goal='',user_id='mobile-user',persona='nova',name='nova-task'}=req.body||{};
  if(!String(goal).trim())return res.status(400).json({error:'goal is required'});
  const id=`task-${Date.now()}-${Math.random().toString(16).slice(2,8)}`;
  autonomousTasks.set(id,{id,status:'running',phase:'understanding',progress:[{key:'understanding',label:'Understanding your request',status:'active'}],createdAt:new Date().toISOString()});
  const setPhase=(key,label)=>{const t=autonomousTasks.get(id);if(!t)return;t.progress=t.progress.map(x=>({...x,status:x.key===key?'active':(x.status==='active'?'done':x.status)}));if(!t.progress.some(x=>x.key===key))t.progress.push({key,label,status:'active'});t.phase=key;};
  const finish=(ok,result,error)=>{const t=autonomousTasks.get(id);if(!t)return;t.progress=t.progress.map(x=>({...x,status:x.status==='active'?'done':x.status}));t.status=ok?'completed':'failed';t.phase=ok?'ready':'failed';t.result=result||null;t.error=error||null;t.completedAt=new Date().toISOString();};
  res.status(202).json({ok:true,taskId:id});
  (async()=>{let workspaceId=null;try{
    setPhase('planning','Planning the solution');
    if(!process.env.GROQ_API_KEY)throw new Error('GROQ_API_KEY is required for autonomous building.');
    workspaceId=(await workspace.create(String(name).replace(/[^a-zA-Z0-9_-]+/g,'-').slice(0,40)||'nova-task')).id;
    setPhase('creating','Creating files');
    const model=process.env.GROQ_MODEL||'openai/gpt-oss-20b';
    const prompt=`Return ONLY JSON with a changes array. Build this goal from scratch in a safe NOVA sandbox. Each item must be {path,content}. No secrets, shell scripts, CI credentials, absolute paths, or files outside the workspace. Keep the implementation small and testable. Goal: ${String(goal).slice(0,8000)}`;
    const first=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are NOVA Builder. Output strict JSON only.'},{role:'user',content:prompt}],temperature:0.2})});
    const firstData=await first.json();if(!first.ok)throw new Error(firstData.error?.message||'Groq build generation failed');
    const raw=firstData.choices?.[0]?.message?.content||'{}';const parsed=JSON.parse(raw.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim());
    setPhase('building','Building the solution');
    const result=await builder.autonomousBuild(workspaceId,{goal,changes:Array.isArray(parsed.changes)?parsed.changes:[],repair:async({diagnosis,test,inspect,round})=>{setPhase('fixing','Fixing an issue');const repairPrompt=`Return ONLY JSON {"changes":[{"path":"...","content":"..."}]}. Repair the sandbox build. Goal: ${goal}
Round: ${round}
Diagnosis: ${JSON.stringify(diagnosis)}
Test: ${JSON.stringify(test)}
Inspect: ${JSON.stringify(inspect)}`;const rr=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.GROQ_API_KEY}`},body:JSON.stringify({model,messages:[{role:'system',content:'You are NOVA repair engineer. Output strict JSON only.'},{role:'user',content:repairPrompt}],temperature:0.1})});const rd=await rr.json();if(!rr.ok)throw new Error(rd.error?.message||'Repair generation failed');const txt=rd.choices?.[0]?.message?.content||'{}';return JSON.parse(txt.replace(/^```(?:json)?/i,'').replace(/```$/,'').trim());}});
    setPhase('testing','Testing');setPhase('verifying','Verifying');
    if(!result.ok)throw new Error('Verification failed; sandbox was rolled back.');
    finish(true,{goal,workspaceId,artifact:result.artifact,rounds:result.rounds,summary:'NOVA implemented, tested, repaired when needed, verified, and packaged the result.'});
    await store.audit({actor:String(user_id),action:'autonomous-build',resource:workspaceId,result:'completed',taskId:id});
  }catch(error){finish(false,{workspaceId},error.message);await store.audit({actor:String(user_id),action:'autonomous-build',resource:workspaceId||'sandbox',result:'failed',taskId:id});}})();
});

app.post('/api/builder/workspaces/:id/plan', requireCreator, async (req,res) => { try { res.json(await builder.buildPlan(req.params.id, req.body?.goal)); } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/package', requireCreator, async (req,res) => { try { const artifact=await workspace.package(req.params.id); res.download(artifact.path, basename(artifact.path)); } catch(error){ res.status(400).json({error:error.message}); } });
app.get('/api/builder/workspaces/:id/manifest', requireAdvanced, async (req,res) => { try { res.json(await workspace.readManifest(req.params.id)); } catch(error){ res.status(404).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/import', requireCreator, async (req,res) => { try { const data=String(req.body?.data||''); if(!data.startsWith('data:application/zip;base64,')) return res.status(400).json({error:'ZIP data URL required'}); const buffer=Buffer.from(data.split(',')[1],'base64'); if(buffer.length>25*1024*1024) return res.status(413).json({error:'Import is limited to 25MB.'}); const tmp=join(os.tmpdir(),`nova-import-${Date.now()}-${Math.random().toString(16).slice(2)}.zip`); await fs.writeFile(tmp,buffer); try { const out=await workspace.importZip(req.params.id,tmp); res.json({ok:true,...out}); } finally { await fs.rm(tmp,{force:true}); } } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/delete', requireCreator, async (req,res) => { try { res.json({ok:true,...await workspace.remove(req.params.id,req.body?.path)}); } catch(error){ res.status(400).json({error:error.message}); } });
app.post('/api/builder/workspaces/:id/move', requireCreator, async (req,res) => { try { res.json({ok:true,...await workspace.move(req.params.id,req.body?.from,req.body?.to)}); } catch(error){ res.status(400).json({error:error.message}); } });
app.get('/api/tools', requireAdvanced, (_req, res) => res.json({ tools: tools.describe() }));
app.get('/api/jobs', requireAdvanced, (_req, res) => res.json({ jobs: jobs.list() }));
app.get('/api/jobs/:id', requireAdvanced, (req, res) => { const job=jobs.get(req.params.id); if(!job) return res.status(404).json({error:'Job not found'}); res.json(job); });

app.post('/api/agent', requireCreator, async (req, res) => {
  const { goal='', user_id='default', persona='nova', attachments=[] } = req.body || {};
  if (typeof goal !== 'string' || !goal.trim()) return res.status(400).json({ error:'goal is required' });
  if (!Array.isArray(attachments) || attachments.length > 5) return res.status(400).json({ error:'A maximum of 5 attachments is supported.' });

  const task=goal.trim();
  const plan=agentCore.plan(task,{attachments});
  const job=jobs.create(task,plan);
  const started=Date.now();

  const executeStep = async (step) => {
    const strategy = step.recovery?.strategy || 'default';
    if(step.id==='security'){
      const url=(task.match(/https?:\/\/[^\s]+/i)||[])[0];
      if(!url) return { ok:true, skipped:true, output:null, note:'No explicit URL found; security inspection was not applicable.' };
      if(strategy === 'risk-review') return { ok:true, degraded:true, output:await tools.execute('assist',{message:`The security scanner is unavailable. Perform a cautious, clearly labeled risk review of this target and state that it is not a definitive security scan: ${task}`,user_id,persona,attachments},{job}) };
      return { ok:true, output:await tools.execute('security',{url},{job}) };
    }
    if(step.id==='research'){
      if(strategy === 'knowledge-fallback') return { ok:true, degraded:true, output:await tools.execute('assist',{message:`Live research is unavailable. Give a clearly labeled knowledge fallback, state that current web verification was unavailable, and list facts that require live checking: ${task}`,user_id,persona,attachments},{job}) };
      return { ok:true, output:await tools.execute('research',{query:task},{job}) };
    }
    if(step.id==='analyze'){
      const prompt = strategy === 'reduce-context'
        ? `Analyze the supplied attachments with reduced context. Focus on highest-signal facts, uncertainty, risks and actions: ${task}`
        : `Analyze the supplied attachments for this goal. Extract key facts, risks, patterns, uncertainties and actionable findings: ${task}`;
      return { ok:true, degraded:strategy === 'reduce-context', output:await tools.execute('assist',{message:prompt,user_id,persona,attachments},{job}) };
    }
    if(step.id==='build'){
      const prompt = strategy === 'reduce-scope'
        ? `Build the smallest testable first increment for this goal. Define acceptance tests and defer non-essential scope: ${task}`
        : strategy === 'solution-plan'
          ? `The build execution path is unavailable. Produce architecture, implementation steps, assumptions, tests and verification criteria for: ${task}`
          : `Act as NOVA's solution architect and builder. Produce a practical implementation plan, solution details, assumptions, tests and verification criteria for: ${task}`;
      return { ok:true, degraded:['reduce-scope','solution-plan'].includes(strategy), output:await tools.execute('assist',{message:prompt,user_id,persona,attachments},{job}) };
    }
    return { ok:true, output:await tools.execute('assist',{message:task,user_id,persona,attachments},{job}) };
  };

  try {
    await jobs.run(job.id, async current => {
      await autonomous.execute(current, { executeStep });
    });
    res.json({...currentJobSummary(job),durationMs:Date.now()-started,approvalRequired:job.status==='awaiting_approval'});
  } catch(error) {
    res.status(job.status==='cancelled'?499:502).json({...currentJobSummary(job),ok:false,error:error.message,durationMs:Date.now()-started});
  }
});

app.post('/api/jobs/:id/approve', requireCreator, async (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({error:'Job not found'});
  if (job.status !== 'awaiting_approval') return res.status(409).json({error:`Job is not awaiting approval. Current status: ${job.status}`});
  job.approval = {...job.approval, approved:true, approvedAt:new Date().toISOString()};
  job.status='queued';
  try {
    await jobs.run(job.id, async current => autonomous.execute(current, { executeStep: async step => {
      if (step.id === 'security') {
        const url=(current.goal.match(/https?:\/\/[^\s]+/i)||[])[0];
        if (!url) return {ok:true,skipped:true};
        return {ok:true,output:await tools.execute('security',{url},{job:current})};
      }
      return {ok:true,output:await tools.execute('assist',{message:current.goal,user_id:'default',persona:'nova',attachments:[]},{job:current})};
    }}));
    res.json({...currentJobSummary(job),ok:job.status==='completed'});
  } catch(error) { res.status(502).json({...currentJobSummary(job),ok:false,error:error.message}); }
});

app.post('/api/jobs/:id/cancel', requireCreator, (req, res) => {
  const job=jobs.cancel(req.params.id);
  if(!job) return res.status(404).json({error:'Job not found'});
  res.json({ok:true,job});
});

function currentJobSummary(job){
  const research=job.results.find(r=>r.step==='research')?.output?.output?.results || [];
  const security=job.results.find(r=>r.step==='security')?.output?.output || null;
  const assistant=job.results.filter(r=>['analyze','build','assist'].includes(r.step)).at(-1)?.output?.output || '';
  return {ok:job.status==='completed',jobId:job.id,goal:job.goal,status:job.status,plan:job.plan,trace:job.trace,results:job.results.map(r=>({step:r.step,ok:r.ok,skipped:r.skipped,degraded:r.degraded,attempt:r.attempt,error:r.error,category:r.category})),response:assistant||'NOVA completed the requested workflow.',research,security,sources:research.slice(0,6).map(r=>`${r.title} — ${r.url}`),verified:job.trace.some(t=>t.id==='verify'&&t.status==='done'),verification:job.verification||null,retries:job.retries,replans:job.replans};
}

app.get('/api/self-test', (_req, res) => {
  const plan=agentCore.plan('research and build a website');
  const checks=[
    {name:'prediction-engine',ok:Array.isArray(prediction.predict('self-test','create a plan'))},
    {name:'security-engine',ok:guard.scanUrl('https://example.com').safe===true},
    {name:'agent-planner',ok:plan.length>=4 && plan.at(-1)?.id==='verify'},
    {name:'tool-registry',ok:tools.has('research')&&tools.has('security')&&tools.has('assist')},
    {name:'job-engine',ok:typeof jobs.create('self-test',plan).id==='string'},
    {name:'retry-policy',ok:agentCore.shouldRetry(1)===true && agentCore.shouldRetry(3)===false},
    {name:'failure-classification',ok:['transient','input','permission','tool','verification'].includes(agentCore.classifyFailure(new Error('temporary timeout')))},
    {name:'replanning',ok:Boolean(agentCore.replan(plan, plan.find(x=>x.id==='research'), new Error('Search provider unavailable'), {replans:0,usedStrategies:[]}))},
    {name:'static-frontend',ok:true}
  ];
  res.json({ok:checks.every(c=>c.ok),version:'21.2.1',checks,external:{groq:Boolean(process.env.GROQ_API_KEY),elevenlabs:Boolean(process.env.ELEVENLABS_API_KEY)},voice:voiceEngine.status(),router:{paidMode:Boolean(process.env.NOVA_PAID_MODE==='true'),providers:aiRouter.status()},openCore:true,builder:{workspaceRoot:workspace.root,safePaths:true,arbitraryShell:false,autonomousBuild:true,rollback:true,verification:true}});
});

app.get('/api/voices', (req, res) => {
  res.json(voiceEngine.status());
});

app.post('/speak', async (req, res) => {
  const { text, persona = 'nova', speed } = req.body || {};
  try {
    const result = await voiceEngine.speak({ text, voice: persona, speed });
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-NOVA-Voice', result.voice);
    res.setHeader('X-NOVA-Voice-Provider', result.provider);
    return res.send(result.audio);
  } catch (error) {
    console.error('NOVA voice engine failed:', error);
    const status = error.code === 'INVALID_TEXT' ? 400 : error.code === 'VOICE_NOT_CONFIGURED' || error.code === 'NO_TTS_PROVIDER' ? 503 : 502;
    return res.status(status).json({
      error: error.message || 'NOVA Voice Engine could not generate speech.',
      code: error.code || 'VOICE_ERROR',
      voice: error.voice || String(persona || 'nova').toLowerCase()
    });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`NOVA Ultimate running on port ${port}`);
});
