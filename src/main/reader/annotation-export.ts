import type { Annotation, AnnotationExportFormat } from '../../shared/contracts/reader';

export interface AnnotationExportDocument {
  readonly extension: 'json' | 'md';
  readonly content: string;
}

export function createAnnotationExport(
  paper: { readonly id: string; readonly title: string },
  annotations: readonly Annotation[],
  format: AnnotationExportFormat,
): AnnotationExportDocument {
  if (format === 'json') {
    return {
      extension: 'json',
      content: `${JSON.stringify(
        { schemaVersion: 1, paper: { id: paper.id, title: paper.title }, annotations },
        null,
        2,
      )}\n`,
    };
  }

  const sections = annotations.map((annotation) => {
    const title = `${annotation.annotationType === 'highlight' ? 'Highlight' : 'Underline'} - page ${String(annotation.pageNumber)}`;
    const comment = annotation.comment ? `\n\n${annotation.comment.trim()}` : '';
    return `## ${title}\n\n> ${annotation.selectedText.replaceAll('\n', '\n> ')}${comment}\n\n<!-- papermind:${annotation.id} -->`;
  });
  const body = sections.length > 0 ? `\n\n${sections.join('\n\n')}` : '\n\n_No annotations._';
  return {
    extension: 'md',
    content: `# ${paper.title}\n\nPaperMind annotation export.${body}\n`,
  };
}
