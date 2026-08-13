import { LibraryError } from '../library/errors';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', '[::1]']);

export function normalizeCodexProxyUrl(value: string | null | undefined): string | null {
  const candidate = value?.trim() ?? '';
  if (!candidate) return null;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch (error) {
    throw invalidProxy(error);
  }

  const port = Number(url.port);
  if (
    url.protocol !== 'http:' ||
    !LOOPBACK_HOSTS.has(url.hostname) ||
    !url.port ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw invalidProxy();
  }

  return `http://${url.host}`;
}

function invalidProxy(cause?: unknown): LibraryError {
  return new LibraryError(
    'INVALID_INPUT',
    'Codex proxy must be an HTTP loopback URL with an explicit port, for example http://127.0.0.1:7897.',
    cause === undefined ? undefined : { cause },
  );
}
