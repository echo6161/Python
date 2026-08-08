import { describe, expect, it } from 'vitest';

import { IPC_CHANNELS } from '../../src/shared/contracts/app';

describe('IPC contract', () => {
  it('contains only the Phase 1 application information channel', () => {
    expect(IPC_CHANNELS).toEqual({
      appGetInfo: 'app:get-info',
    });
    expect(Object.isFrozen(IPC_CHANNELS)).toBe(true);
  });
});
