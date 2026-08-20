import { describe, expect, it } from 'vitest';

import {
  researchAgentCitationIdentitySchema,
  reviewResearchAgentProposalSchema,
  startResearchAgentRunSchema,
} from '../../src/main/ipc/research-agent-schemas';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

describe('Research Agent IPC schemas', () => {
  it('accepts only bounded domain inputs', () => {
    expect(startResearchAgentRunSchema.parse({ workspaceId, goal: 'Inspect evidence.' })).toEqual({
      workspaceId,
      goal: 'Inspect evidence.',
    });
    expect(() =>
      startResearchAgentRunSchema.parse({ workspaceId, goal: 'x', url: 'http://127.0.0.1:1' }),
    ).toThrow();
    expect(() =>
      startResearchAgentRunSchema.parse({ workspaceId, goal: 'x'.repeat(4001) }),
    ).toThrow();
  });

  it('rejects arbitrary paths, aliases and cross-shape proposal fields', () => {
    expect(() =>
      researchAgentCitationIdentitySchema.parse({ workspaceId, runId, alias: '../../secret' }),
    ).toThrow();
    expect(() =>
      reviewResearchAgentProposalSchema.parse({
        workspaceId,
        runId,
        proposalId: '33333333-3333-4333-8333-333333333333',
        rowVersion: 1,
        filePath: 'C:\\Users\\secret',
      }),
    ).toThrow();
  });
});
