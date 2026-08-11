import type { ZoteroItemRef } from '../../shared/contracts/zotero';

export interface ExternalProtocolLauncher {
  openExternal(url: string): Promise<void>;
}

export class ZoteroEvidenceLauncher {
  public constructor(private readonly launcher: ExternalProtocolLauncher) {}

  public async openItem(ref: ZoteroItemRef): Promise<void> {
    await this.launcher.openExternal(this.itemUri('select', ref));
  }

  public async openPdf(ref: ZoteroItemRef, pageNumber: number): Promise<void> {
    const uri = new URL(this.itemUri('open-pdf', ref));
    uri.searchParams.set('page', String(pageNumber));
    await this.launcher.openExternal(uri.toString());
  }

  private itemUri(action: 'open-pdf' | 'select', ref: ZoteroItemRef): string {
    const libraryPath = ref.library.type === 'group' ? `groups/${ref.library.id}` : 'library';
    return `zotero://${action}/${libraryPath}/items/${ref.itemKey}`;
  }
}
