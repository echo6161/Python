import { pathToFileURL } from 'node:url';

export interface VscodeExternalOpener {
  openExternal(url: string): Promise<void>;
}

export class RepositoryVscodeLauncher {
  public constructor(private readonly opener: VscodeExternalOpener) {}

  public async open(targetPath: string, line?: number, column?: number): Promise<void> {
    const filePath = pathToFileURL(targetPath).pathname;
    const location = line === undefined ? '' : `:${String(line)}:${String(column ?? 1)}`;
    await this.opener.openExternal(`vscode://file${filePath}${location}`);
  }
}
