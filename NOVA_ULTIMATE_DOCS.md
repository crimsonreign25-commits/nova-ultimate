# NOVA ULTIMATE

The advanced features repository for NOVA Personal Assistant with predictive intent, orchestration, Code Studio, mobile adapters, and security analysis.

## Features

🔮 **Predictive Intent Engine** - Suggests actions based on user input patterns
📋 **Orchestrator** - Coordinates multi-step workflows and task execution
💻 **Code Studio** - Generates full web and mobile applications
🔒 **Mobile Guard** - Scans URLs and permissions for security threats
📱 **Mobile Bridge** - Adapters for iOS/Android capabilities

## Installation

```bash
git clone https://github.com/crimsonreign25-commits/nova-ultimate.git
cd nova-ultimate
npm install
cp .env.example .env
npm start
```

## Configuration

Create `.env` with:

```env
GROQ_API_KEY=your-groq-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-key
PORT=3000
NODE_ENV=development
NOVA_PERSONALITY=jarvis
```

## Architecture

```
core/
  ├── prediction-engine.js    (Intent prediction)
  └── orchestrator.js         (Workflow coordination)

studio/
  ├── code-generator.js       (App generation)
  └── project-templates.js    (6 templates)

security/
  ├── mobile-guard.js         (Threat scanning)
  └── threat-response.js      (Threat handling)

mobile/
  ├── bridge.js               (OS adapter)
  └── capabilities/           (SMS, calls, calendar, etc.)
```

## Usage

### Predictive Intent

```javascript
import { PredictionEngine } from './core/prediction-engine.js';

const engine = new PredictionEngine();
engine.observe('user1', 'create a website', { completed: true });
const suggestions = engine.predict('user1', 'create');
console.log(suggestions);
// [
//   { intent: 'code_generation', completion: 'Generate a new project', tools: ['code-studio'], confidence: 0.95 },
//   { intent: 'mobile_control', completion: 'Control mobile device', tools: ['mobile-bridge'], confidence: 0.92 }
// ]
```

### Code Generation

```javascript
import { CodeGenerator } from './studio/code-generator.js';

const generator = new CodeGenerator();
const project = generator.generate('E-commerce store', { template: 'ecommerce', framework: 'react' });
console.log(project.files);
```

### Security Scanning

```javascript
import { MobileGuard } from './security/mobile-guard.js';

const guard = new MobileGuard();
const urlScan = guard.scanUrl('https://example.com/login');
const permissionScan = guard.scanPermissions(['READ_SMS', 'CAMERA']);
console.log(urlScan, permissionScan);
```

### Orchestration

```javascript
import { Orchestrator } from './core/orchestrator.js';

const orchestrator = new Orchestrator();
orchestrator
  .register('fetch-data', async (input) => { /* ... */ })
  .register('process', async (input) => { /* ... */ })
  .register('deploy', async (input) => { /* ... */ });

const job = await orchestrator.execute('start', {
  plan: [
    { name: 'fetch-data', input: 'user-id' },
    { name: 'process', input: 'data' },
    { name: 'deploy', input: 'processed' }
  ]
});

console.log(job.status); // 'completed'
```

## Deployment

### Render

1. Go to [render.com](https://render.com)
2. Create new Web Service from this repo
3. Set branch to `main`
4. Add environment variables
5. Deploy

### Vercel

```bash
npm install -g vercel
vercel
```

## Security Considerations

- Mobile capabilities require explicit OS permissions
- SMS, calls, files, and location access are **not** automatically enabled
- URL scanning checks for phishing and malware patterns
- All API keys must be stored as environment variables
- Use HTTPS in production

## License

MIT
