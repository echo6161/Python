// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { ZoteroEvidenceLauncher } from '../../src/main/question/zotero-evidence-launcher';

describe('Zotero Evidence navigation', () => {
  it('constructs fixed user/group Zotero protocol targets inside Main', async () => {
    const openExternal = vi.fn(() => Promise.resolve());
    const launcher = new ZoteroEvidenceLauncher({ openExternal });
    await launcher.openItem({
      serverId: 'ServerIdentity01',
      library: { type: 'user', id: '0' },
      itemKey: 'PAPERAA2',
    });
    await launcher.openPdf(
      {
        serverId: 'ServerIdentity01',
        library: { type: 'group', id: '42' },
        itemKey: 'PDFAAAA2',
      },
      9,
    );
    expect(openExternal).toHaveBeenNthCalledWith(1, 'zotero://select/library/items/PAPERAA2');
    expect(openExternal).toHaveBeenNthCalledWith(
      2,
      'zotero://open-pdf/groups/42/items/PDFAAAA2?page=9',
    );
  });

  it('maps a broken OS protocol handler to a safe Zotero launch error', async () => {
    const launcher = new ZoteroEvidenceLauncher({
      openExternal: vi.fn(() => Promise.reject(new Error('Application not found at C:\\old-path'))),
    });

    await expect(
      launcher.openPdf(
        {
          serverId: 'ServerIdentity01',
          library: { type: 'user', id: '0' },
          itemKey: 'PDFAAAA2',
        },
        9,
      ),
    ).rejects.toMatchObject({
      code: 'ZOTERO_LAUNCH_FAILED',
      message:
        'Zotero could not be opened. Repair or reinstall Zotero so zotero:// links use the current application.',
    });
  });
});
