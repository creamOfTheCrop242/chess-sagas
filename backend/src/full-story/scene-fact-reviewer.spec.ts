import { SceneFactReviewSession } from './scene-fact-reviewer';
import { SceneValidationUnavailableError } from './scene-repair-coordinator';
import type { SceneFactContract, FactScene } from './scene-fact-contracts';

const contracts: SceneFactContract[] = [1, 2, 3].map((ply) => ({
  id: `scene:${ply}`,
  version: 'scene-facts-v4',
  ply,
  facts: [
    {
      id: `${ply}:state`,
      pieceId: 'evander',
      requirement: 'Preserve the owner',
    },
  ],
  characters: [],
}));
const scenes: FactScene[] = contracts.map((c) => ({
  ply: c.ply,
  characters: [],
  fantasyNarration: 'Valid original prose.',
}));
const telemetry = {
  gameId: 'game',
  generationRunId: 'run',
  attempt: 1,
  repairMode: 'none' as const,
};
const cleanReview = ({
  contracts: input,
}: {
  contracts: SceneFactContract[];
}) => ({
  assessments: input.map((c) => ({
    contractId: c.id,
    checkedFactIds: c.facts.map((f) => f.id),
    issues: [],
  })),
});

describe('batched factual review', () => {
  it('retains valid assessments and retries only the incomplete assessment once', async () => {
    const provider = jest
      .fn()
      .mockImplementationOnce(async (r) => {
        const review = cleanReview(r);
        review.assessments[1].checkedFactIds = [];
        return review;
      })
      .mockImplementation(async (r) => cleanReview(r));
    const session = new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    );
    expect(await session.validate(contracts, scenes, 0)).toEqual([]);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(
      provider.mock.calls[1][0].contracts.map((c: SceneFactContract) => c.id),
    ).toEqual(['scene:2']);
    await session.validate(contracts, scenes, 1);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(
      scenes.every((s) => s.fantasyNarration === 'Valid original prose.'),
    ).toBe(true);
  });
  it('records repeated malformed reviews as unavailable, never as a prose defect or endless retry', async () => {
    const provider = jest.fn().mockResolvedValue({ assessments: [] });
    const session = new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    );
    const result = await session.validate(contracts, scenes, 0);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(3);
    expect(
      result.every(
        (f) => f.severity === 'warning' && f.message.includes('unavailable'),
      ),
    ).toBe(true);
    await session.validate(contracts, scenes, 1);
    expect(provider).toHaveBeenCalledTimes(2);
  });
  it('reviews original prose and invalidates changed neighbors, without repeating unchanged assessments', async () => {
    const provider = jest.fn().mockImplementation(async (r) => cleanReview(r));
    const review = new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    );
    await review.validate(contracts, scenes, 0);
    await review.validate(contracts, scenes, 1);
    expect(provider).toHaveBeenCalledTimes(1);
    await review.validate(
      contracts,
      scenes.map((s) =>
        s.ply === 1 ? { ...s, fantasyNarration: 'Changed prose.' } : s,
      ),
      2,
    );
    expect(
      provider.mock.calls[1][0].contracts.map((c: SceneFactContract) => c.ply),
    ).toEqual([1, 2]);
  });
  it('records strong contradictions but does not block in observe mode', async () => {
    const provider = jest.fn().mockImplementation(async (r) => {
      const result = cleanReview(r);
      return {
        assessments: result.assessments.map((a) => ({
          ...a,
          issues: [
            {
              factId: a.checkedFactIds[0],
              status: 'contradiction',
              confidence: 'high',
              actorId: null,
              affectedPieceId: null,
              excerpt: 'Valid original prose.',
              reason: 'Observed wrong owner',
            },
          ],
        })),
      };
    });
    const record = jest.fn();
    const findings = await new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      record,
    ).validate(contracts, scenes, 0);
    expect(findings.every((f) => f.severity === 'warning')).toBe(true);
    expect(record.mock.calls[0][0].findings[0].severity).toBe('error');
  });
  it('enforces evidence-backed contradictions when enabled', async () => {
    const provider = jest.fn().mockImplementation(async (r) => {
      const result = cleanReview(r);
      return {
        assessments: result.assessments.map((a) => ({
          ...a,
          issues: [
            {
              factId: a.checkedFactIds[0],
              status: 'contradiction',
              confidence: 'high',
              actorId: null,
              affectedPieceId: null,
              excerpt: 'Valid original prose.',
              reason: 'Wrong owner',
            },
          ],
        })),
      };
    });
    expect(
      (
        await new SceneFactReviewSession(
          'enforce',
          provider,
          telemetry,
          jest.fn(),
        ).validate(contracts, scenes, 0)
      )[0].severity,
    ).toBe('error');
  });
  it('records unavailable observation without accepting it as a clean review', async () => {
    const provider = jest.fn().mockRejectedValue(new Error('unavailable'));
    const record = jest.fn();
    const result = await new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      record,
    ).validate(contracts, scenes, 0);
    expect(result[0].message).toContain('unavailable');
    expect(record).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'unavailable' }),
    );
    await expect(
      new SceneFactReviewSession(
        'enforce',
        provider,
        telemetry,
        record,
      ).validate(contracts, scenes, 0),
    ).rejects.toBeInstanceOf(SceneValidationUnavailableError);
  });
  it('bounds call sizes and supports disabling the reviewer', async () => {
    const many = Array.from({ length: 14 }, (_, i) => ({
      ...contracts[0],
      id: `scene:${i + 1}`,
      ply: i + 1,
    }));
    const text = many.map((c) => ({ ...scenes[0], ply: c.ply }));
    const provider = jest.fn().mockImplementation(async (r) => cleanReview(r));
    await new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    ).validate(many, text, 0);
    expect(provider).toHaveBeenCalledTimes(3);
    expect(provider.mock.calls.every(([r]) => r.contracts.length <= 6)).toBe(
      true,
    );
    provider.mockClear();
    await new SceneFactReviewSession(
      'off',
      provider,
      telemetry,
      jest.fn(),
    ).validate(many, text, 0);
    expect(provider).not.toHaveBeenCalled();
  });
});
