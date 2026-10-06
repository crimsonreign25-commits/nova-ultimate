import { randomUUID } from 'node:crypto';

const DEFAULT_PROFILE = {
  displayName: '',
  language: 'en',
  accessibility: {
    largeText: false, highContrast: false, reducedMotion: false, voiceFirst: false,
    captions: true, focusMode: false, screenReader: false, simplified: false,
    speechRate: 1, confirmActions: true
  },
  interaction: { persona: 'nova', responseStyle: 'balanced', proactive: false, concise: false },
  privacy: { personalization: true, analytics: false, localFirst: true },
  safety: { confirmationLevel: 'important', allowExternalActions: false }
};

const clone = value => JSON.parse(JSON.stringify(value));
const merge = (base, patch) => {
  const out = clone(base);
  const walk = (a,b) => Object.entries(b || {}).forEach(([k,v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v) && a[k] && typeof a[k] === 'object') walk(a[k],v);
    else if (v !== undefined) a[k]=v;
  });
  walk(out, patch || {}); return out;
};

export class NovaUniversal {
  constructor({ store }) { this.store = store; }
  async getProfile(userId='guest') {
    const saved = await this.store.getProfile(userId);
    return merge(DEFAULT_PROFILE, saved || {});
  }
  async updateProfile(userId='guest', patch={}) {
    const profile = merge(await this.getProfile(userId), patch);
    profile.updatedAt = new Date().toISOString();
    return this.store.saveProfile(userId, profile);
  }
  capabilities({ mobile=false }={}) {
    return {
      version: '21.2.1',
      universalAccessibility: true,
      mobileAssistant: true,
      pwa: true,
      androidAccessibilityService: mobile ? 'supported-by-companion' : 'available',
      features: ['voice-first','live-captions','screen-reader','large-text','high-contrast','reduced-motion','focus-mode','vision','memory','safe-actions','offline-queue','proactive-assistance','cross-device-profile'],
      safety: { confirmationsFor: ['messages','external-actions','device-controls','account-changes','destructive-actions'], dryRunAvailable: true }
    };
  }
  checkAction(action='unknown', { external=false, destructive=false, device=false, sensitive=false }={}) {
    const kind = destructive ? 'destructive' : device ? 'device-control' : external ? 'external' : sensitive ? 'sensitive' : 'low-risk';
    const requiresConfirmation = kind !== 'low-risk';
    return { allowed: true, action, risk: kind, requiresConfirmation, policy: requiresConfirmation ? 'confirm-before-execute' : 'safe-to-run', auditId: randomUUID() };
  }
  proactive({ context={} }={}) {
    const suggestions=[];
    const hour = new Date().getHours();
    if (hour < 6) suggestions.push({type:'wellbeing',priority:'low',message:'It is quite early. I can keep responses brief and quiet.'});
    if (context.lowConnectivity) suggestions.push({type:'connectivity',priority:'high',message:'Connectivity looks limited. NOVA can queue safe requests and retry later.'});
    if (context.permissionDenied) suggestions.push({type:'permission',priority:'medium',message:'A permission is unavailable. I can explain exactly why it is needed.'});
    return { generatedAt:new Date().toISOString(), suggestions };
  }
}
