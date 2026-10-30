// Share only this app's port with Tailscale Serve; never reset other services.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const record = path.join(root, 'data', 'tailscale.json');
const candidates = ['tailscale', '/usr/local/bin/tailscale', '/opt/homebrew/bin/tailscale', '/Applications/Tailscale.app/Contents/MacOS/Tailscale'];

function run(bin, args) {
  const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 15000, windowsHide: true });
  if (r.error || r.status !== 0) throw new Error(r.error?.message || r.stderr.trim() || r.stdout.trim() || 'Tailscale command failed');
  return r.stdout;
}

export function findTailscale() {
  for (const bin of candidates) {
    try {
      const status = JSON.parse(run(bin, ['status', '--json']));
      if (status.BackendState !== 'Running') return null;
      const hostname = status.Self?.DNSName?.replace(/\.$/, '').toLowerCase();
      if (hostname) return { bin, hostname };
    } catch { /* Not installed here or not available. Local startup still works. */ }
  }
  return null;
}

export function assertSharingRoute(config, hostname, remotePort, target, saved = null) {
  const key = `${hostname}:${remotePort}`;
  const handlers = config.Web?.[key]?.Handlers;
  const owned = saved?.hostname === hostname && saved?.port === remotePort && saved?.target === handlers?.['/']?.Proxy;
  // Refuse to replace a different service or a route that was made public with Funnel.
  if (config.AllowFunnel?.[key]) throw new Error('This Tailscale port is public through Funnel. Choose another QT_TAILSCALE_PORT.');
  if (config.TCP?.[remotePort] && (!config.TCP[remotePort].HTTP || !handlers || Object.keys(handlers).length !== 1 || (handlers['/']?.Proxy !== target && !owned))) {
    throw new Error(`Tailscale port ${remotePort} belongs to another service. Choose another QT_TAILSCALE_PORT.`);
  }
}

export function shareTailscale(ts, localPort, remotePort) {
  const config = JSON.parse(run(ts.bin, ['serve', 'status', '--json']));
  const target = `http://127.0.0.1:${localPort}`;
  const key = `${ts.hostname}:${remotePort}`;
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(record, 'utf8')); } catch { /* An unrecorded route is never taken over. */ }
  assertSharingRoute(config, ts.hostname, remotePort, target, saved);
  // A port change can retarget this app's recorded route, preserving other services.
  run(ts.bin, ['serve', '--bg', `--http=${remotePort}`, target]);
  const url = `http://${key}`;
  fs.mkdirSync(path.dirname(record), { recursive: true });
  fs.writeFileSync(record, JSON.stringify({ hostname: ts.hostname, port: remotePort, target, url }, null, 2) + '\n');
  return url;
}

export function stopTailscale() {
  if (!fs.existsSync(record)) return;
  const saved = JSON.parse(fs.readFileSync(record, 'utf8'));
  const ts = findTailscale();
  if (!ts) throw new Error('Tailscale is unavailable. Its saved sharing route will be cleaned up next time you stop the app with Tailscale connected.');
  const config = JSON.parse(run(ts.bin, ['serve', 'status', '--json']));
  const handlers = config.Web?.[`${saved.hostname}:${saved.port}`]?.Handlers;
  if (config.TCP?.[saved.port]?.HTTP && handlers && Object.keys(handlers).length === 1 && handlers['/']?.Proxy === saved.target) {
    run(ts.bin, ['serve', `--http=${saved.port}`, 'off']);
    console.log('Stopped Trade Terminal sharing through Tailscale.');
  }
  fs.rmSync(record, { force: true });
}
