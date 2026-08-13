import { describe, expect, it } from 'vitest';

import { AiPlanProposalGenerator } from '../../src/main/research-plan/plan-proposal-generator';
import type { AiAssistantService, AiProviderSession } from '../../src/main/ai/ai-assistant-service';
import type { AiProvider, AiProviderEvent } from '../../src/main/ai/provider';

const workspace = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  name: 'Plan',
  description: '',
  researchGoal: 'Verify a result',
  status: 'active' as const,
  createdAt: '2026-08-13T00:00:00.000Z',
  updatedAt: '2026-08-13T00:00:00.000Z',
  rowVersion: 1,
};
const settings = {
  providerId: 'openai' as const,
  baseUrl: 'https://api.openai.com/v1',
  codexProxyUrl: null,
  model: 'fake',
  temperature: 0,
  maxOutputTokens: 1000,
  saveHistoryByDefault: false,
};

describe('AI Plan proposal generator', () => {
  it('accepts bounded valid JSON from a fake provider', async () => {
    const generator = new AiPlanProposalGenerator(
      aiWithOutput(
        JSON.stringify({
          goal: 'Verify a result',
          rationale: 'Start with evidence.',
          changes: [
            {
              kind: 'add',
              taskId: null,
              title: 'Review evidence',
              description: 'Read it.',
              rationale: 'Needed',
              dependencyTaskIds: [],
              referenceCandidateIds: [],
            },
          ],
        }),
      ),
    );
    await expect(
      generator.generate({
        workspace,
        currentPlan: null,
        candidates: [],
        mode: 'generate',
        instruction: 'Plan it',
      }),
    ).resolves.toMatchObject({ goal: 'Verify a result', model: 'fake' });
  });

  it('rejects invalid JSON and unknown candidate ids without persisting anything', async () => {
    const invalid = new AiPlanProposalGenerator(aiWithOutput('not json'));
    await expect(
      invalid.generate({
        workspace,
        currentPlan: null,
        candidates: [],
        mode: 'generate',
        instruction: 'Plan it',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    const unknown = new AiPlanProposalGenerator(
      aiWithOutput(
        JSON.stringify({
          goal: 'Verify a result',
          rationale: 'Start.',
          changes: [
            {
              kind: 'add',
              taskId: null,
              title: 'Review',
              description: '',
              rationale: 'Needed',
              dependencyTaskIds: [],
              referenceCandidateIds: ['unknown'],
            },
          ],
        }),
      ),
    );
    await expect(
      unknown.generate({
        workspace,
        currentPlan: null,
        candidates: [],
        mode: 'generate',
        instruction: 'Plan it',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
  });
});

function aiWithOutput(output: string): AiAssistantService {
  const provider: AiProvider = {
    id: 'mock',
    async *stream(): AsyncIterable<AiProviderEvent> {
      await Promise.resolve();
      yield { type: 'delta', delta: output };
      yield { type: 'completed', providerRequestId: 'fake', inputTokens: null, outputTokens: null };
    },
  };
  return {
    createProviderSession: () =>
      Promise.resolve({ provider, settings } satisfies AiProviderSession),
  } as AiAssistantService;
}
