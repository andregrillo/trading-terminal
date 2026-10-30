#!/usr/bin/env node
// Start Trade Terminal in the background and open your browser. It keeps running after this
// terminal closes. If it's already running, this just opens the browser.
//   node scripts/launch.js            node scripts/launch.js --no-open
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findTailscale, shareTailscale, stopTailscale } from './tailscale.js';
import { DEFAULT_HOST, lanUrls } from '../lib/network.js';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const first = Number(process.env.PORT) || 3777;
const bindHost = process.env.HOST || DEFAULT_HOST;
const ts = process.argv.includes('--no-tailscale') ? null : findTailscale();
const allowedHosts = [...new Set([...(process.env.QT_ALLOWED_HOSTS || '').split(',').filter(Boolean), ...(ts ? [ts.hostname] : [])])].join(',');
const same = (a, b) => !!a && path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();

async function running() {
  for (let p = first; p < first + 21; p++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/api/health`, { signal: AbortSignal.timeout(700) });
      const j = await r.json();
      // Only this folder's copy counts; another install on the same port range is left alone.
      if (j.app === 'quant-terminal' && same(j.root, root)) return p;
    } catch { /* not this port */ }
  }
  return null;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['cmd', ['/c', 'start', '""', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  try { const c = spawn(cmd, args, { detached: true, stdio: 'ignore' }); c.on('error', () => {}); c.unref(); } catch { /* headless */ }
}

let port = await running();
if (port) {
  // Apply listener changes to an already-running copy, without touching another installation.
  const health = await (await fetch(`http://127.0.0.1:${port}/api/health`)).json();
  let needsRestart = health.listenHost !== bindHost;
  if (ts && !needsRestart) {
    const status = await new Promise((resolve, reject) => {
      const req = http.get({ hostname: '127.0.0.1', port, path: '/api/health', headers: { Host: ts.hostname }, timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode); });
      req.on('timeout', () => req.destroy(new Error('The running app did not respond.')));
      req.on('error', reject);
    });
    needsRestart = status === 403;
  }
  if (needsRestart) {
    await fetch(`http://127.0.0.1:${port}/api/shutdown`, { method: 'POST', headers: { 'x-qt': '1' } });
    for (let i = 0; i < 50 && await running(); i++) await new Promise((resolve) => setTimeout(resolve, 100));
    if (await running()) throw new Error('The old app did not stop. Run node scripts/stop.js and try again.');
    port = null;
  }
}
if (!port) {
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });
  const log = path.join(root, 'data', 'server.log');
  const fd = fs.openSync(log, 'a');
  const child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, detached: true, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, HOST: bindHost, QT_ALLOWED_HOSTS: allowedHosts } });
  child.on('error', (e) => console.error(`Trade Terminal could not start: ${e.message}`));
  child.unref();
  fs.closeSync(fd);
  for (let i = 0; i < 40 && !port; i++) { await new Promise((r) => setTimeout(r, 400)); port = await running(); }
  if (!port) {
    console.error(`Trade Terminal didn't start. Last lines of ${log}:\n${fs.readFileSync(log, 'utf8').split('\n').slice(-20).join('\n')}`);
    process.exit(1);
  }
}
if (process.argv.includes('--no-tailscale')) {
  try { stopTailscale(); } catch (e) { console.warn(e.message); }
} else if (ts) {
  try {
    const remotePort = Number(process.env.QT_TAILSCALE_PORT) || first;
    if (!Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) throw new Error('QT_TAILSCALE_PORT must be a port between 1 and 65535.');
    console.log(`Open on your iPhone with Tailscale connected: ${shareTailscale(ts, port, remotePort)}`);
  } catch (e) { console.warn(`The app is running on this Mac, but Tailscale sharing failed: ${e.message}`); }
} else {
  console.log('Tailscale is not connected or not installed.');
}
const url = `http://localhost:${port}`;
const urls = lanUrls(port, bindHost);
if (urls.length) console.log(`Open on another device on your network: ${urls.join('  ')}`);
if (!process.argv.includes('--no-open') && process.env.QT_NO_OPEN !== '1') openBrowser(url);
console.log(`Trade Terminal is running at ${url}\nStop it any time with: node scripts/stop.js`);
process.exit(0);
