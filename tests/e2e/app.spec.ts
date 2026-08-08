import { _electron as electron, expect, test } from '@playwright/test';

test('launches the desktop shell with renderer isolation enabled', async ({
  browserName,
}, testInfo) => {
  expect(browserName).toBe('chromium');

  const electronEnvironment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      electronEnvironment[key] = value;
    }
  }
  electronEnvironment.NODE_ENV = 'test';
  delete electronEnvironment.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: ['.'],
    env: electronEnvironment,
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await expect(window.getByText('PaperMind', { exact: true })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Reader' })).toBeVisible();
    await expect(window.getByRole('heading', { name: 'Assistant' })).toBeVisible();

    const securityState = await window.evaluate(() => {
      const isolatedWindow = window as unknown as {
        readonly paperMind?: { readonly app?: { readonly getInfo?: unknown } };
        readonly process?: unknown;
        readonly require?: unknown;
      };

      return {
        hasNodeRequire: typeof isolatedWindow.require !== 'undefined',
        hasNodeProcess: typeof isolatedWindow.process !== 'undefined',
        hasPreloadApi: typeof isolatedWindow.paperMind?.app?.getInfo === 'function',
      };
    });

    expect(securityState).toEqual({
      hasNodeRequire: false,
      hasNodeProcess: false,
      hasPreloadApi: true,
    });

    await window.screenshot({ path: testInfo.outputPath('papermind-shell.png') });
  } finally {
    await electronApp.close();
  }
});
