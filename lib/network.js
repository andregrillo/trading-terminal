import os from 'node:os';

export const DEFAULT_HOST = '0.0.0.0';

// Local interface addresses remain an explicit Host allowlist, even on a shared listener.
export function lanAddresses(host = DEFAULT_HOST) {
  if (['127.0.0.1', 'localhost', '::1'].includes(host)) return [];
  return [...new Set(Object.values(os.networkInterfaces()).flat().filter(Boolean)
    .filter(item => !item.internal).map(item => item.address))];
}

export function lanUrls(port, host = DEFAULT_HOST) {
  return lanAddresses(host)
    .filter(address => !address.includes(':') && (host === DEFAULT_HOST || host === '::' || host === address))
    .map(address => `http://${address}:${port}`);
}
