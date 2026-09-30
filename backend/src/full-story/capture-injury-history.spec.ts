import type { GameLedger } from '../chess/models/game-ledger';
import type {
  FullStoryProvider,
  SceneDeathDirective,
  WoundTimelineDirective,
} from './full-story.provider';
import {
  buildSceneFactContracts,
  sceneFactFindings,
  type SceneFactReview,
} from './scene-fact-contracts';
import { SceneFactReviewSession } from './scene-fact-reviewer';
import { coordinateSceneRepairs } from './scene-repair-coordinator';

const original =
  "Catrin drove her knife into an existing wound beneath Zinnia's armor. Zinnia died.";
const corrected = "Catrin drove her knife beneath Zinnia's armor. Zinnia died.";
const telemetry = { gameId: 'test', generationRunId: 'test', attempt: 1 };
const fixture = (
  text = original,
  wounds: WoundTimelineDirective[] = [],
  background?: string,
) => {
  const ledger = {
    pieces: [
      { id: 'catrin', characterName: 'Catrin', fantasyType: 'grunt' },
      {
        id: 'zinnia',
        characterName: 'Zinnia',
        fantasyType: 'knight-commander',
        capturedAtPly: 20,
        backstory: background,
      },
    ],
    events: [
      {
        ply: 20,
        pieceId: 'catrin',
        capturedPieceId: 'zinnia',
        isCapture: true,
      },
    ],
  } as unknown as GameLedger;
  const deaths = [
    {
      ply: 20,
      noOtherDeaths: true,
      authorizedDeaths: [
        {
          ply: 20,
          eventKind: 'capture',
          authorizedVictimId: 'zinnia',
          decisiveActorId: 'catrin',
          deathCatalogId: null,
        },
      ],
    },
  ] as SceneDeathDirective[];
  const scenes = [{ ply: 20, characters: ['catrin'], fantasyNarration: text }];
  const contracts = buildSceneFactContracts(
    ledger,
    scenes,
    [],
    wounds,
    deaths,
    [],
  );
  return { ledger, scenes, contracts };
};
const clean = (
  contracts: ReturnType<typeof fixture>['contracts'],
): SceneFactReview => ({
  assessments: contracts.map((c) => ({
    contractId: c.id,
    checkedFactIds: c.facts.map((f) => f.id),
    issues: [],
  })),
});
const issue = {
  factId: '20:prior-injury:zinnia',
  status: 'contradiction' as const,
  confidence: 'high' as const,
  actorId: 'catrin',
  affectedPieceId: 'zinnia',
  excerpt: "an existing wound beneath Zinnia's armor",
  reason: 'An earlier wound is asserted without supporting history',
};

describe('capture-victim injury history', () => {
  it('gives the victim an independent history contract without removing fatal-injury permission', () => {
    const { contracts } = fixture();
    expect(contracts[0].facts.find((f) => f.id === issue.factId)).toMatchObject(
      {
        pieceId: 'zinnia',
        enforceConfirmed: true,
      },
    );
    expect(
      contracts[0].facts.find((f) => f.id === issue.factId)?.requiredReview,
    ).toBeUndefined();
    expect(
      contracts[0].facts.find((f) => f.id === '20:state:zinnia')!.requirement,
    ).toContain('Fatal harm to an authorized capture victim is allowed');
    expect(
      contracts[0].characters.find((p) => p.pieceId === 'catrin')!
        .priorInjuryEvidence,
    ).toBeUndefined();
    expect(
      contracts[0].characters.find((p) => p.pieceId === 'zinnia')!
        .priorInjuryEvidence,
    ).toEqual({ background: null, earlierWounds: [] });
  });

  it('supplies background and healed history without lending future injuries backward', () => {
    const wound = (ply: number, recoveryPly: number | null) =>
      ({
        woundId: `zinnia:${ply}`,
        pieceId: 'zinnia',
        inflictedAtPly: ply,
        recoveryPly,
        injury: 'A cut on her arm',
      }) as WoundTimelineDirective;
    const { contracts } = fixture(
      original,
      [wound(8, 12), wound(18, null), wound(22, null)],
      'A childhood accident left a healed scar.',
    );
    const victim = contracts[0].characters.find((p) => p.pieceId === 'zinnia')!;
    expect(
      victim.priorInjuryEvidence!.earlierWounds.map((w) => w.inflictedAtPly),
    ).toEqual([8, 18]);
    expect(victim.enteringWounds.map((w) => w.inflictedAtPly)).toEqual([18]);
    expect(victim.priorInjuryEvidence!.background).toContain('healed scar');
  });

  it.each([
    { status: 'uncertain' as const },
    { status: 'omitted' as const },
    { confidence: 'medium' as const },
    { affectedPieceId: null },
    { affectedPieceId: 'catrin' },
    { excerpt: 'A quotation not present in the scene' },
  ])('does not block on insufficient evidence: %j', (override) => {
    const { contracts, scenes } = fixture();
    const review = clean(contracts);
    review.assessments[0].issues.push({ ...issue, ...override });
    expect(sceneFactFindings(contracts, scenes, review)[0].severity).toBe(
      'warning',
    );
  });

  it.each([
    corrected,
    "Catrin cut Zinnia's arm, then deepened that fresh cut and killed her.",
    'Zinnia had no old wound. Catrin drove the knife into her chest and killed her.',
    'Catrin guarded her own wounded hand before stabbing Zinnia fatally.',
    'Zinnia remembered a scar from childhood before Catrin killed her.',
  ])(
    'accepts a satisfied semantic verdict without keyword-based rejection: %s',
    async (text) => {
      const { contracts, scenes } = fixture(text);
      const provider = jest
        .fn()
        .mockImplementation(async (r) => clean(r.contracts));
      const session = new SceneFactReviewSession(
        'observe',
        provider,
        telemetry,
        jest.fn(),
      );
      expect(await session.validate(contracts, scenes, 0)).toEqual([]);
      expect(provider).toHaveBeenCalledTimes(1);
    },
  );

  it('repairs only the confirmed scene in observe mode and rechecks its replacement', async () => {
    // Scripted judgments exercise routing and evidence gates, not model accuracy.
    const provider = jest
      .fn()
      .mockImplementation(
        async (r: Parameters<FullStoryProvider['reviewSceneFacts']>[0]) => {
          const review = clean(r.contracts);
          if (r.scenes[0].fantasyNarration === original)
            review.assessments[0].issues.push(issue);
          return review;
        },
      );
    const session = new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    );
    const repair = jest
      .fn()
      .mockResolvedValue([{ ply: 20, fantasyNarration: corrected }]);
    const result = await coordinateSceneRepairs({
      scenes: [
        { startPly: 19, fantasyNarration: 'Zinnia killed Jasper.' },
        { startPly: 20, fantasyNarration: original },
      ],
      validate: async (candidate, round) => {
        const f = fixture(candidate[1].fantasyNarration);
        return session.validate(f.contracts, f.scenes, round);
      },
      repair,
      apply: (s, fantasyNarration) => ({ ...s, fantasyNarration }),
      record: async () => {},
    });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][1]).toEqual([20]);
    expect(result.scenes[0].fantasyNarration).toBe('Zinnia killed Jasper.');
    expect(result.scenes[1].fantasyNarration).toBe(corrected);
    expect(result.findings).toEqual([]);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('does not turn unavailable review into a fatal generation error in observe mode', async () => {
    const { contracts, scenes } = fixture();
    const provider = jest
      .fn()
      .mockRejectedValue(new Error('Review unavailable'));
    const session = new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    );
    const result = await session.validate(contracts, scenes, 0);
    expect(provider).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(1);
    expect(result[0].severity).toBe('warning');
  });

  it('respects explicit off mode for this non-mandatory review', async () => {
    const { contracts, scenes } = fixture();
    const provider = jest.fn();
    const session = new SceneFactReviewSession(
      'off',
      provider,
      telemetry,
      jest.fn(),
    );
    expect(await session.validate(contracts, scenes, 0)).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
  });
});
