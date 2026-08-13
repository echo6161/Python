import type { ZoteroItemRef } from '../../shared/contracts/zotero';
import { ZoteroBridgeError } from '../zotero/zotero-errors';

export interface ExternalProtocolLauncher {
  openExternal(url: string): Promise<void>;
}

export class ZoteroEvidenceLauncher {
  public constructor(private readonly launcher: ExternalProtocolLauncher) {}

  public async openItem(ref: ZoteroItemRef): Promise<void> {
    await this.openExternal(this.itemUri('select', ref));
  }

  public async openPdf(ref: ZoteroItemRef, pageNumber: number): Promise<void> {
    const uri = new URL(this.itemUri('open-pdf', ref));
    uri.searchParams.set('page', String(pageNumber));
    await this.openExternal(uri.toString());
  }

  private async openExternal(uri: string): Promise<void> {
    try {
      await this.launcher.openExternal(uri);
    } catch (error) {
      throw new ZoteroBridgeError(
        'ZOTERO_LAUNCH_FAILED',
        'Zotero could not be opened. Repair or reinstall Zotero so zotero:// links use the current application.',
        { cause: error },
      );
    }
  }

  private itemUri(action: 'open-pdf' | 'select', ref: ZoteroItemRef): string {
    const libraryPath = ref.library.type === 'group' ? `groups/${ref.library.id}` : 'library';
    return `zotero://${action}/${libraryPath}/items/${ref.itemKey}`;
  }
}
