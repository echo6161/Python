import { describe, expect, it } from 'vitest';

import {
  zoteroCollectionRefSchema,
  zoteroItemRefSchema,
  zoteroSearchRequestSchema,
} from '../../src/main/ipc/zotero-schemas';
import { ensureTrustedSender } from '../../src/main/ipc/library-ipc';
import { invokeZoteroValidated } from '../../src/main/ipc/zotero-ipc';

const validRef = {
  serverId: 'ServerIdentity01',
  library: { type: 'user', id: '0' },
  itemKey: 'PARENTA2',
} as const;

describe('Zotero IPC schemas and sender boundary', () => {
  it('accepts stable references and rejects host, port, URL, and path injection', () => {
    expect(zoteroItemRefSchema.parse(validRef)).toEqual(validRef);
    expect(
      zoteroCollectionRefSchema.parse({
        serverId: validRef.serverId,
        library: validRef.library,
        collectionKey: 'CECTAAA2',
      }),
    ).toMatchObject({ collectionKey: 'CECTAAA2' });
    for (const field of ['host', 'port', 'protocol', 'url', 'path']) {
      expect(() =>
        zoteroItemRefSchema.parse({ ...validRef, [field]: 'attacker-controlled' }),
      ).toThrow();
      expect(() =>
        zoteroSearchRequestSchema.parse({
          requestId: '00000000-0000-4000-8000-000000000001',
          start: 0,
          limit: 20,
          query: 'methods',
          [field]: 'attacker-controlled',
        }),
      ).toThrow();
    }
    expect(() => zoteroItemRefSchema.parse({ ...validRef, itemKey: '../zotero.sqlite' })).toThrow();
    expect(() =>
      zoteroSearchRequestSchema.parse({
        requestId: '00000000-0000-4000-8000-000000000001',
        start: 0,
        limit: 20,
        query: 'x'.repeat(501),
      }),
    ).toThrow();
  });

  it('allows only the main frame to invoke privileged handlers', () => {
    const mainFrame = {};
    expect(() =>
      ensureTrustedSender({ senderFrame: mainFrame, sender: { mainFrame } } as never),
    ).not.toThrow();
    expect(() => ensureTrustedSender({ senderFrame: {}, sender: { mainFrame } } as never)).toThrow(
      'only available to the main window',
    );
  });

  it('validates IPC outputs before returning data to Renderer', async () => {
    const mainFrame = {};
    const event = { senderFrame: mainFrame, sender: { mainFrame } } as never;
    const result = await invokeZoteroValidated(event, zoteroItemRefSchema, () =>
      Promise.resolve({ ...validRef, host: '127.0.0.1' } as never),
    );

    expect(result).toEqual({
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'The Zotero request was invalid.' },
    });
  });
});
