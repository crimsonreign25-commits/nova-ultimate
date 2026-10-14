/** Server-owned access policy for NOVA Ultimate. Never accept a role from request bodies. */
export const ACCESS_POLICIES = Object.freeze({
  guest: Object.freeze({ label: 'Guest', level: 0, permissions: ['chat:basic', 'voice:use', 'camera:use', 'accessibility:personalize'], visibleAreas: ['chat', 'voice', 'camera', 'settings'], description: 'Limited guest experience; sign in for saved, cross-device features.' }),
  user: Object.freeze({ label: 'User', level: 1, permissions: ['chat:full', 'voice:use', 'camera:use', 'memory:own', 'files:own', 'research:use', 'accessibility:personalize', 'profile:own'], visibleAreas: ['chat', 'history', 'memory', 'voice', 'camera', 'research', 'files', 'settings'], description: 'Standard assistant features and personal settings.' }),
  viewer: Object.freeze({ label: 'Authorised Personnel', level: 2, permissions: ['chat:full', 'voice:use', 'camera:use', 'memory:own', 'files:own', 'research:use', 'accessibility:personalize', 'profile:own', 'restricted:read'], visibleAreas: ['chat', 'history', 'memory', 'voice', 'camera', 'research', 'files', 'settings', 'restricted-read'], description: 'Standard features plus explicitly approved read-only restricted information.' }),
  creator: Object.freeze({ label: 'Creator', level: 3, permissions: ['*'], visibleAreas: ['*'], description: 'Full system administration, internal tools, access management, diagnostics and configuration.' })
});

export function accessPolicyFor(role = 'guest') {
  const key = Object.hasOwn(ACCESS_POLICIES, role) ? role : 'guest';
  const policy = ACCESS_POLICIES[key];
  return { role: key, ...policy, permissions: [...policy.permissions], visibleAreas: [...policy.visibleAreas] };
}

export function hasPermission(role, permission) {
  const policy = accessPolicyFor(role);
  return policy.permissions.includes('*') || policy.permissions.includes(permission);
}
