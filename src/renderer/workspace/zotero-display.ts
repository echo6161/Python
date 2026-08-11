import type { ZoteroItemSummary, ZoteroPdfAvailability } from '../../shared/contracts/zotero';

export function zoteroCreatorNames(item: ZoteroItemSummary): string {
  return item.creators.map(({ name }) => name).join(', ');
}

export function zoteroPdfLabel(pdf: ZoteroPdfAvailability): string {
  if (!pdf.hasPdf) return 'No PDF';
  const mode = pdf.storageMode === 'linked' ? 'Linked' : 'Stored';
  if (pdf.state === 'available') return `${mode} PDF`;
  if (pdf.state === 'not_local') return `${mode} PDF | Not local`;
  return `${mode} PDF | Missing`;
}

export function formatZoteroItemType(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/gu, '$1 $2')
    .replace(/^./u, (letter) => letter.toUpperCase());
}
