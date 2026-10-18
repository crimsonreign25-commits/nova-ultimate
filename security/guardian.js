import dns from 'node:dns/promises';
import net from 'node:net';
import http from 'node:http';
import https from 'node:https';

function isPublicIPv4(ip) {
  if (net.isIP(ip) !== 4) return false;
  const octets = ip.split('.').map(Number);
  if (octets.length !== 4 || octets.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b] = octets;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51) || (a === 203 && b === 0));
}

function safeTarget(raw) {
  let url;
  try { url = new URL(String(raw || '').trim()); } catch { throw new Error('Enter a valid public server URL, including https://.'); }
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only HTTP and HTTPS targets are supported.');
  if (url.username || url.password) throw new Error('URLs containing credentials are not allowed.');
  if (url.port && !['80','443'].includes(url.port)) throw new Error('For this initial safe assessment, only standard HTTP/HTTPS ports (80 and 443) are supported.');
  if (url.protocol === 'https:' && url.port && url.port !== '443') throw new Error('HTTPS assessments must use port 443.');
  if (url.protocol === 'http:' && url.port && url.port !== '80') throw new Error('HTTP assessments must use port 80.');
  url.hash = '';
  return url;
}

function requestHeaders(url, ip) {
  const transport = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = transport.request(url, {
      method: 'HEAD', timeout: 5000, maxHeaderSize: 16 * 1024,
      // Pin the request to a validated public IPv4 address to reduce DNS-rebinding/SSRF risk.
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
      headers: { 'User-Agent': 'NOVA-Guardian/1.0 (passive-security-assessment)', 'Connection': 'close' }
    }, res => {
      res.resume();
      resolve({ statusCode: res.statusCode || 0, headers: res.headers });
    });
    req.on('timeout', () => req.destroy(new Error('Target timed out after 5 seconds.')));
    req.on('error', reject);
    req.end();
  });
}

export class NovaGuardian {
  async assessPublicServer(rawTarget) {
    const url = safeTarget(rawTarget);
    const host = url.hostname.toLowerCase();
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || net.isIP(host) === 6) {
      throw new Error('Only public IPv4-hosted targets are supported in this initial release; local, private and IPv6-only targets are blocked.');
    }
    let addresses;
    if (net.isIP(host) === 4) addresses = [{ address: host, family: 4 }];
    else {
      try { addresses = await dns.lookup(host, { all: true, verbatim: true }); }
      catch { throw new Error('The target hostname could not be resolved.'); }
    }
    if (!addresses.length || addresses.some(item => !isPublicIPv4(item.address))) {
      throw new Error('Target resolves to a non-public or unsupported address. Assessment blocked to protect internal networks.');
    }
    const ip = addresses[0].address;
    let response;
    try { response = await requestHeaders(url, ip); }
    catch (error) { throw new Error(`Could not complete the passive HTTP check: ${String(error.message || 'network error').slice(0,160)}`); }
    const h = response.headers;
    const findings = [];
    const add = (id, severity, title, detail, recommendation) => findings.push({ id, severity, title, detail, recommendation });
    if (url.protocol === 'https:' && !h['strict-transport-security']) add('hsts', 'medium', 'HSTS header missing', 'The HTTPS response did not advertise Strict-Transport-Security.', 'After confirming all subdomains support HTTPS, configure an appropriate Strict-Transport-Security policy.');
    if (!h['content-security-policy']) add('csp', 'medium', 'Content Security Policy missing', 'No Content-Security-Policy header was observed on the HEAD response.', 'Design and test a restrictive Content-Security-Policy suited to the application.');
    if (!h['x-content-type-options']) add('nosniff', 'low', 'MIME-sniffing protection missing', 'X-Content-Type-Options was not observed.', 'Set X-Content-Type-Options: nosniff where appropriate.');
    if (!h['x-frame-options'] && !String(h['content-security-policy'] || '').includes('frame-ancestors')) add('framing', 'medium', 'Clickjacking protection not observed', 'Neither X-Frame-Options nor a CSP frame-ancestors directive was observed.', 'Set an appropriate frame-ancestors policy or X-Frame-Options.');
    if (!h['referrer-policy']) add('referrer', 'low', 'Referrer policy missing', 'Referrer-Policy was not observed.', 'Set a privacy-preserving Referrer-Policy appropriate to the site.');
    if (!h['permissions-policy']) add('permissions', 'low', 'Permissions Policy missing', 'Permissions-Policy was not observed.', 'Explicitly limit browser capabilities such as camera, microphone and geolocation where suitable.');
    if (h.server) add('server-banner', 'info', 'Server banner disclosed', `The response advertises server software: ${String(h.server).slice(0,120)}.`, 'Consider minimising unnecessary version disclosure; this alone does not prove a vulnerability.');
    if (response.statusCode >= 300 && response.statusCode < 400) add('redirect', 'info', 'Redirect not followed', `The target returned HTTP ${response.statusCode}; NOVA did not follow redirects.`, 'If needed, confirm the final destination separately and include it in the authorised scope.');
    const high = findings.filter(f => f.severity === 'high' || f.severity === 'critical').length;
    const medium = findings.filter(f => f.severity === 'medium').length;
    const report = {
      reportVersion: '1.0', engine: 'NOVA Guardian passive HTTP header assessment',
      generatedAt: new Date().toISOString(), target: url.origin + url.pathname,
      method: 'HEAD only; no exploit attempts, intrusive probes, credential testing, or changes',
      response: { statusCode: response.statusCode, protocol: url.protocol, resolvedAddress: ip },
      summary: { findingCount: findings.length, highOrCritical: high, medium, low: findings.filter(f=>f.severity==='low').length, informational: findings.filter(f=>f.severity==='info').length },
      findings,
      limitations: ['This is a passive HTTP-header review, not a full penetration test or malware scan.', 'A missing header is a hardening opportunity, not proof of a vulnerability.', 'No server settings or files were changed.', 'Only the supplied public IPv4 target and its first URL were assessed; redirects were not followed.']
    };
    return report;
  }
}

export { isPublicIPv4, safeTarget };
