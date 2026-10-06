import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';
import env from '../../config/env.js';

// Fetching other people's web pages from inside our network, safely:
//
//  - only http(s), only ports 80 / 443;
//  - never an address inside a private network (localhost, 10.x, 192.168.x,
//    cloud metadata, ...) - checked on the address actually connected to, so a
//    name that resolves to one is refused too, and again on every redirect;
//  - a time limit, a size limit, at most a few redirects;
//  - no cookies, no credentials, no form submissions: only plain GETs.
//
// SCRAPER_ALLOW_PRIVATE_HOSTS lifts the address and port rules (tests, local trials).

export const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 4;

const blocked = new net.BlockList();
for (const [range, bits] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
]) {
  blocked.addSubnet(range, bits, 'ipv4');
}
for (const [range, bits] of [
  ['::', 128],
  ['::1', 128],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
  ['64:ff9b::', 96],
]) {
  blocked.addSubnet(range, bits, 'ipv6');
}

// Whether an IP address is inside a private / special network.
export function isBlockedAddress(address) {
  const family = net.isIP(address);
  if (!family) return true;
  if (family === 6) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is judged as IPv4.
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
    if (mapped) return blocked.check(mapped[1], 'ipv4');
    return blocked.check(address, 'ipv6');
  }
  return blocked.check(address, 'ipv4');
}

export class FetchError extends Error {
  constructor(reason, detail, httpStatus) {
    super(detail);
    this.reason = reason;
    this.httpStatus = httpStatus;
  }
}

// A web address the scraper may visit, normalised - or a FetchError.
export function checkUrl(raw) {
  let url;
  try {
    url = new URL(String(raw).trim());
  } catch {
    throw new FetchError('invalid_url', 'Not a web address');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new FetchError('invalid_url', 'Only http:// and https:// addresses can be scraped');
  if (url.username || url.password) throw new FetchError('invalid_url', 'Addresses with a user name or password are not used');
  const allowAny = env.scraper.allowPrivateHosts;
  if (!allowAny && url.port && !['80', '443'].includes(url.port)) throw new FetchError('blocked_address', 'Only the standard web ports (80, 443) are used');
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!allowAny && (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || (net.isIP(host) && isBlockedAddress(host)))) {
    throw new FetchError('blocked_address', 'Addresses inside a private network cannot be scraped');
  }
  url.hash = '';
  return url;
}

// dns.lookup, refusing private addresses: what the connection actually uses.
function safeLookup(hostname, options, callback) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const usable = env.scraper.allowPrivateHosts ? addresses : addresses.filter((a) => !isBlockedAddress(a.address));
    if (!usable.length) return callback(new FetchError('blocked_address', 'The site resolves to a private network address'));
    if (options?.all) return callback(null, usable);
    return callback(null, usable[0].address, usable[0].family);
  });
}

function decode(buffer, contentType) {
  const charset = /charset=([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase();
  try {
    return new TextDecoder(charset && charset !== 'utf8' ? charset : 'utf-8').decode(buffer);
  } catch {
    return new TextDecoder('utf-8').decode(buffer);
  }
}

function requestOnce(url, { accept }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http;
    const req = client.get(
      url,
      {
        lookup: safeLookup,
        headers: { 'User-Agent': env.scraper.userAgent, Accept: accept, 'Accept-Encoding': 'gzip, deflate, br', 'Accept-Language': 'en' },
        timeout: env.scraper.timeoutMs,
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ redirect: res.headers.location, status });
        }
        const declared = Number(res.headers['content-length']);
        if (declared > MAX_BYTES) {
          res.destroy();
          return reject(new FetchError('too_large', 'The page is larger than 2 MB', status));
        }
        const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
        const stream = encoding === 'gzip' ? res.pipe(zlib.createGunzip()) : encoding === 'deflate' ? res.pipe(zlib.createInflate()) : encoding === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
        const chunks = [];
        let size = 0;
        stream.on('data', (chunk) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            res.destroy();
            reject(new FetchError('too_large', 'The page is larger than 2 MB', status));
            return;
          }
          chunks.push(chunk);
        });
        stream.on('end', () => resolve({ status, headers: res.headers, body: decode(Buffer.concat(chunks), res.headers['content-type']) }));
        stream.on('error', () => reject(new FetchError('invalid_html', 'The page could not be read', status)));
      }
    );
    req.on('timeout', () => req.destroy(new FetchError('timeout', `No answer within ${Math.round(env.scraper.timeoutMs / 1000)} seconds`)));
    req.on('error', (err) => reject(err instanceof FetchError ? err : new FetchError(err.code === 'ENOTFOUND' ? 'unreachable' : 'unreachable', err.code === 'ENOTFOUND' ? 'The site does not exist (no such address)' : `Could not connect (${err.code ?? err.message})`)));
  });
}

// GETs a URL: -> { url (after redirects), status, contentType, body }.
export async function safeFetch(raw, { accept = 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5' } = {}) {
  let url = checkUrl(raw);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const response = await requestOnce(url, { accept });
    if (response.redirect) {
      url = checkUrl(new URL(response.redirect, url).href);
      continue;
    }
    return { url: url.href, status: response.status, contentType: String(response.headers['content-type'] ?? ''), body: response.body };
  }
  throw new FetchError('http_error', 'Too many redirects');
}
