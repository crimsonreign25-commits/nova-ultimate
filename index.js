import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PredictionEngine } from './core/prediction-engine.js';
import { Orchestrator } from './core/orchestrator.js';
import { MobileGuard } from './security/mobile-guard.js';
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


const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_EXTRACTED_CHARS = 50000;

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

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/status', (_req, res) => {
  res.json({
    name: 'NOVA Ultimate',
    version: '8.1.0',
    status: 'operational',
    features: ['prediction', 'orchestration', 'security-scanning', 'live-voice', 'camera', 'multimodal', 'document-intelligence', 'command-center'],
    groqConfigured: Boolean(process.env.GROQ_API_KEY),
    voiceConfigured: Boolean(process.env.ELEVENLABS_API_KEY),
    personas: ['nova', 'jarvis', 'friday']
  });
});

app.post('/predict', (req, res) => {
  const { user_id = 'default', message = '' } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }
  prediction.observe(user_id, message);
  res.json({ suggestions: prediction.predict(user_id, message) });
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
  if (!process.env.GROQ_API_KEY) {
    return res.json({
      response: 'NOVA Ultimate is online. Add GROQ_API_KEY in Render to enable AI responses.',
      suggestions: prediction.predict(user_id, message)
    });
  }

  try {
    const personaPrompts = {
      nova: 'You are NOVA, an adaptive personal AI assistant. Be clear, helpful, calm, and concise.',
      jarvis: 'You are JARVIS, an original strategic AI persona. Be precise, composed, technical when useful, and proactive. Do not claim to be a fictional character.',
      friday: 'You are FRIDAY, an original conversational AI persona. Be warm, quick, confident, and practical. Do not claim to be a fictional character.'
    };
    const selectedPersona = ['nova', 'jarvis', 'friday'].includes(String(persona).toLowerCase()) ? String(persona).toLowerCase() : 'nova';

    const imageAttachments = attachments.filter((item) => item && typeof item.data === 'string' && String(item.type || '').startsWith('image/')).slice(0, 5);
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
    const model = hasImages
      ? (process.env.GROQ_VISION_MODEL || 'qwen/qwen3.8-27b')
      : (process.env.GROQ_MODEL || 'openai/gpt-oss-20b');

    const systemText = hasImages
      ? `${personaPrompts[selectedPersona]} You can analyze the user's attached images. Describe only what is actually visible, and clearly distinguish observations from guesses. If the user asks about text in an image, read it carefully.`
      : `${personaPrompts[selectedPersona]} Personality profile: ${process.env.NOVA_PERSONALITY || 'professional'}.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemText },
          { role: 'user', content: userContent }
        ],
        temperature: 0.7
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: 'Groq request failed', details: data.error?.message });
    const responseText = data.choices?.[0]?.message?.content || 'No response returned.';
    const warning = extractionErrors.length ? `\n\nAttachment note: ${extractionErrors.join(' ')}` : '';
    res.json({
      response: responseText + warning,
      persona: selectedPersona,
      analyzedAttachments: attachments.map((item) => item.name).filter(Boolean),
      extractedDocuments: attachments.filter((item) => item && !String(item.type || '').startsWith('image/')).map((item) => item.name).filter(Boolean)
    });
  } catch (error) {
    console.error('Assist request failed:', error);
    res.status(502).json({ error: 'Unable to reach Groq' });
  }
});


app.post('/speak', async (req, res) => {
  const { text, persona = 'nova' } = req.body || {};
  if (typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (!process.env.ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'ElevenLabs is not configured. Add ELEVENLABS_API_KEY in Render.' });
  }

  const voiceMap = {
    nova: process.env.NOVA_VOICE_ID,
    jarvis: process.env.JARVIS_VOICE_ID,
    friday: process.env.FRIDAY_VOICE_ID
  };
  const selectedPersona = ['nova', 'jarvis', 'friday'].includes(String(persona).toLowerCase()) ? String(persona).toLowerCase() : 'nova';
  const voiceId = voiceMap[selectedPersona];
  if (!voiceId) {
    return res.status(503).json({ error: `${selectedPersona.toUpperCase()} voice is not configured. Add its voice ID in Render.` });
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': process.env.ELEVENLABS_API_KEY
      },
      body: JSON.stringify({
        text: text.slice(0, 5000),
        model_id: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.15,
          use_speaker_boost: true,
          speed: 1.0
        }
      })
    });

    if (!response.ok) {
      const details = await response.text();
      return res.status(502).json({ error: 'ElevenLabs request failed', details: details.slice(0, 500) });
    }

    const audio = Buffer.from(await response.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-store');
    res.send(audio);
  } catch (error) {
    console.error('Speech request failed:', error);
    res.status(502).json({ error: 'Unable to reach ElevenLabs' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`NOVA Ultimate running on port ${port}`);
});
