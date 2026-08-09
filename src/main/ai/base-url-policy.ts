import { lookup as callbackLookup } from 'node:dns';
import { isIP, type LookupFunction } from 'node:net';

import { LibraryError } from '../library/errors';

export const OFFICIAL_OPENAI_BASE_URL = 'https://api.openai.com/v1';

export function normalizeAiBaseUrl(value: string): string {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new LibraryError('INVALID_INPUT', 'Enter a valid HTTPS AI Base URL.');
  }

  if (url.protocol !== 'https:') {
    throw new LibraryError('INVALID_INPUT', 'The AI Base URL must use HTTPS.');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new LibraryError(
      'INVALID_INPUT',
      'The AI Base URL cannot contain credentials, a query, or a fragment.',
    );
  }
  if (url.port && url.port !== '443') {
    throw new LibraryError('INVALID_INPUT', 'The AI Base URL must use the standard HTTPS port.');
  }

  const hostname = stripIpv6Brackets(url.hostname.toLocaleLowerCase()).replace(/\.$/u, '');
  if (isBlockedHostname(hostname) || isPrivateAddress(hostname)) {
    throw new LibraryError('INVALID_INPUT', 'The AI Base URL cannot target a local network.');
  }

  const pathname = url.pathname.replace(/\/+$/u, '') || '/v1';
  const serializedHostname = isIP(hostname) === 6 ? `[${hostname}]` : hostname;
  return `https://${serializedHostname}${pathname}`;
}

export function createPublicAiLookup(resolver: LookupFunction = callbackLookup): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { ...options, all: true }, (error, result, family) => {
      if (error) {
        callback(error, '', 0);
        return;
      }
      const addresses = Array.isArray(result)
        ? result
        : [{ address: result, family: family ?? isIP(result) }];
      if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
        callback(blockedAddressError(), '', 0);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const selected = addresses[0];
      if (!selected) {
        callback(blockedAddressError(), '', 0);
        return;
      }
      callback(null, selected.address, selected.family);
    });
  };
}

export function isOfficialOpenAiBaseUrl(value: string): boolean {
  return normalizeAiBaseUrl(value) === OFFICIAL_OPENAI_BASE_URL;
}

function isBlockedHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    (isIP(hostname) === 0 && !hostname.includes('.')) ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home')
  );
}

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
}

function isPrivateAddress(address: string): boolean {
  const normalized = stripIpv6Brackets(address.toLocaleLowerCase().split('%', 1)[0] ?? '');
  const firstHextet = Number.parseInt(normalized.split(':', 1)[0] ?? '', 16);
  if (
    normalized === '::1' ||
    normalized === '::' ||
    (Number.isFinite(firstHextet) && (firstHextet & 0xffc0) === 0xfe80)
  ) {
    return true;
  }
  if (
    normalized.startsWith('fc') ||
    normalized.startsWith('fd') ||
    normalized.startsWith('fec') ||
    normalized.startsWith('fed') ||
    normalized.startsWith('fee') ||
    normalized.startsWith('fef') ||
    normalized.startsWith('ff')
  ) {
    return true;
  }
  const ipv4Mapped = extractEmbeddedIpv4(normalized);
  const ipv4 = ipv4Mapped ?? (isIP(normalized) === 4 ? normalized : null);
  if (!ipv4) return false;
  const octets = ipv4.split('.').map(Number);
  const first = octets[0] ?? -1;
  const second = octets[1] ?? -1;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 0) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    (first === 198 && second === 51 && (octets[2] ?? -1) === 100) ||
    (first === 203 && second === 0 && (octets[2] ?? -1) === 113) ||
    first >= 224
  );
}

function extractEmbeddedIpv4(address: string): string | null {
  const dotted = /^::(?:ffff:)?(\d+\.\d+\.\d+\.\d+)$/u.exec(address)?.[1];
  if (dotted) return dotted;
  const hexadecimal = /^::(?:ffff:)?([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(address);
  if (!hexadecimal) return null;
  const high = Number.parseInt(hexadecimal[1] ?? '', 16);
  const low = Number.parseInt(hexadecimal[2] ?? '', 16);
  return `${String(high >> 8)}.${String(high & 0xff)}.${String(low >> 8)}.${String(low & 0xff)}`;
}

function blockedAddressError(): NodeJS.ErrnoException {
  return Object.assign(new Error('The AI endpoint resolved to a blocked network address.'), {
    code: 'EACCES',
  });
}
