import { describe, expect, it } from 'vitest';

import { createWindowOptions } from '../../src/main/window-options';

describe('createWindowOptions', () => {
  it('keeps privileged Electron capabilities out of the renderer', () => {
    const options = createWindowOptions('C:/safe/preload.js');

    expect(options.webPreferences).toMatchObject({
      preload: 'C:/safe/preload.js',
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });
  });
});
