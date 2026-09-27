import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { PredictionEngine } from './core/prediction-engine.js';
import { Orchestrator } from './core/orchestrator.js';
import { MobileGuard } from './security/mobile-guard.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const app = express();
const port = process.env.PORT || 3000;
const prediction = new PredictionEngine();
const orchestrator = new Orchestrator();
const guard = new MobileGuard();

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(join(__dirname, 'public')));

app.get('/', (_req, res) => {
  res.sendFile(join(__dirname, 'public', 'index.html'));
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/status', (_req, res) => {
  res.json({
    name: 'NOVA Ultimate',
    version: '1.0.0',
    status: 'operational',
    features: ['prediction', 'orchestration', 'security-scanning'],
    groqConfigured: Boolean(process.env.GROQ_API_KEY)
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
  const { message, user_id = 'default' } = req.body || {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message is required' });
  }

  prediction.observe(user_id, message);
  if (!process.env.GROQ_API_KEY) {
    return res.json({
      response: 'NOVA Ultimate is online. Add GROQ_API_KEY in Render to enable AI responses.',
      suggestions: prediction.predict(user_id, message)
    });
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
        messages: [
          { role: 'system', content: `You are NOVA, a helpful personal assistant. Personality: ${process.env.NOVA_PERSONALITY || 'professional'}.` },
          { role: 'user', content: message }
        ],
        temperature: 0.7
      })
    });
    const data = await response.json();
    if (!response.ok) return res.status(502).json({ error: 'Groq request failed', details: data.error?.message });
    res.json({ response: data.choices?.[0]?.message?.content || 'No response returned.' });
  } catch (error) {
    console.error('Assist request failed:', error);
    res.status(502).json({ error: 'Unable to reach Groq' });
  }
});

app.listen(port, '0.0.0.0', () => {
  console.log(`NOVA Ultimate running on port ${port}`);
});
