import { randomBytes } from 'node:crypto';

import type {
  Annotation,
  AnnotationExportFormat,
  CreateAnnotationInput,
  PdfAccess,
  ReadingState,
  SaveReadingStateInput,
  UpdateAnnotationInput,
} from '../../shared/contracts/reader';
import { LibraryError } from '../library/errors';
import type { PaperFileStorage } from '../library/file-storage';
import type { ManagedPaperFileRecord, PaperDataGateway } from '../library/paper-data-gateway';
import { createAnnotationExport } from './annotation-export';

interface AccessGrant {
  readonly paperId: string;
  readonly token: string;
  readonly expiresAt: number;
}

const ACCESS_TTL_MS = 60 * 60 * 1000;
const MAX_ACCESS_GRANTS = 128;

export class PaperReaderService {
  private readonly grants = new Map<string, AccessGrant>();

  public constructor(
    private readonly database: PaperDataGateway,
    private readonly storage: PaperFileStorage,
  ) {}

  public async issuePdfAccess(paperId: string): Promise<PdfAccess> {
    const file = await this.database.getManagedPaperFile(paperId);
    if (!file) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }
    this.removeExpiredGrants();
    const token = randomBytes(32).toString('hex');
    this.grants.set(token, { paperId, token, expiresAt: Date.now() + ACCESS_TTL_MS });
    while (this.grants.size > MAX_ACCESS_GRANTS) {
      const oldest = this.grants.keys().next().value;
      if (!oldest) break;
      this.grants.delete(oldest);
    }
    return { url: `papermind-pdf://paper/${paperId}?token=${token}` };
  }

  public async resolvePdfRequest(urlValue: string): Promise<{
    readonly absolutePath: string;
    readonly file: ManagedPaperFileRecord;
  }> {
    const url = new URL(urlValue);
    const paperId = url.pathname.slice(1);
    const token = url.searchParams.get('token') ?? '';
    const grant = this.grants.get(token);
    if (url.hostname !== 'paper' || grant?.paperId !== paperId || grant.expiresAt < Date.now()) {
      this.grants.delete(token);
      throw new LibraryError('PERMISSION_DENIED', 'PDF access is not authorized.');
    }
    const file = await this.database.getManagedPaperFile(paperId);
    if (!file) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }
    return { absolutePath: this.storage.resolveManagedPath(file.relativePath), file };
  }

  public listAnnotations(paperId: string): Promise<readonly Annotation[]> {
    return this.database.listAnnotations(paperId);
  }

  public createAnnotation(input: CreateAnnotationInput): Promise<Annotation> {
    return this.database.createAnnotation(input);
  }

  public updateAnnotation(input: UpdateAnnotationInput): Promise<Annotation> {
    return this.database.updateAnnotation(input);
  }

  public async deleteAnnotation(id: string, rowVersion: number): Promise<{ readonly id: string }> {
    await this.database.deleteAnnotation(id, rowVersion);
    return { id };
  }

  public getReadingState(paperId: string): Promise<ReadingState | null> {
    return this.database.getReadingState(paperId);
  }

  public saveReadingState(input: SaveReadingStateInput): Promise<ReadingState> {
    return this.database.saveReadingState(input);
  }

  public async buildAnnotationExport(paperId: string, format: AnnotationExportFormat) {
    const paper = await this.database.getPaper(paperId);
    if (!paper) {
      throw new LibraryError('NOT_FOUND', 'The paper no longer exists.');
    }
    const annotations = await this.database.listAnnotations(paperId);
    return { paper, annotations, document: createAnnotationExport(paper, annotations, format) };
  }

  private removeExpiredGrants(): void {
    const now = Date.now();
    for (const [token, grant] of this.grants) {
      if (grant.expiresAt < now) this.grants.delete(token);
    }
  }
}
