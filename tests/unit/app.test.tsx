import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/renderer/App';

describe('App', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'paperMind', {
      configurable: true,
      value: {
        app: {
          getInfo: vi.fn().mockResolvedValue({
            name: 'PaperMind',
            version: '0.1.0-test',
            platform: 'win32',
          }),
        },
      },
    });
  });

  it('renders the secure desktop workspace placeholders', async () => {
    render(<App />);

    expect(screen.getByRole('navigation', { name: 'Primary' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'All papers' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Reader' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'Assistant' })).toBeDefined();
    expect(await screen.findByText('v0.1.0-test')).toBeDefined();
  });

  it('opens the settings placeholder from the sidebar', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeDefined();
    expect(screen.getByText('No external services are configured.')).toBeDefined();
  });
});
