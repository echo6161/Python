import type { ZoteroItemRef } from '../../shared/contracts/zotero';

export function zoteroReferenceKey(ref: ZoteroItemRef): string {
  return `${ref.serverId}:${ref.library.type}:${ref.library.id}:${ref.itemKey}`;
}
