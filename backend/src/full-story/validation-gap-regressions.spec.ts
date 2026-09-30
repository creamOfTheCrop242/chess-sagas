import type { GameLedger, PieceIdentity } from '../chess/models/game-ledger';
import { MYTHIC_ARMS, establishedMythicArm } from '../chess/mythic-arms';
import { attackCapabilities } from '../chess/equipment-capabilities';
import {
  DeterministicStoryValidator,
  type ScenePackageValidation,
} from '../story-validation/deterministic-story.validator';
import type { ValidationFinding } from '../story-validation/models/story-validation';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import {
  FullStoryService,
  buildDeathContracts,
  buildEndingDeathContract,
  buildEndingWorldState,
  buildMythicArmRepairContracts,
} from './full-story.service';
import { buildEndingFactContracts } from './ending-fact-contracts';
import {
  buildSceneFactContracts,
  combineSceneFindings,
} from './scene-fact-contracts';
import { SceneFactReviewSession } from './scene-fact-reviewer';
import { buildSceneObligations } from './scene-obligations';
import { checkmateChronology } from './checkmate-chronology';
import type { FullStoryProvider } from './full-story.provider';
type ReviewRequest = Parameters<FullStoryProvider['reviewSceneFacts']>[0];
import {
  SceneValidationUnavailableError,
  coordinateSceneRepairs,
} from './scene-repair-coordinator';

const mateLedger = (): GameLedger =>
  ({
    initialFen: 'gap-regression',
    metadata: { termination: 'checkmate', result: '1-0' },
    pieces: [
      {
        id: 'queen',
        characterName: 'Catrin',
        permanentName: 'Northern Queen',
        side: 'north',
        fantasyType: 'queen',
        chessType: 'q',
        alive: true,
      },
      {
        id: 'defender',
        characterName: 'Eric',
        permanentName: 'Southern Knight Commander',
        side: 'south',
        fantasyType: 'knight-commander',
        chessType: 'n',
        capturedAtPly: 42,
        alive: false,
      },
      {
        id: 'king',
        characterName: 'Gareth',
        permanentName: 'Southern King',
        side: 'south',
        fantasyType: 'king',
        chessType: 'k',
        alive: true,
      },
    ],
    events: [
      {
        ply: 42,
        pieceId: 'queen',
        capturedPieceId: 'defender',
        isCapture: true,
        isCheckmate: true,
        checkmateExplanation: { kingId: 'king' },
      },
    ],
  }) as GameLedger;

describe('validation gap regressions', () => {
  const validator = new DeterministicStoryValidator();
  const telemetry = { gameId: 'test', generationRunId: 'test', attempt: 1 };

  it('shares final-event chronology between drafting, review and repair obligations', () => {
    const ledger = mateLedger();
    const deaths = buildDeathContracts(ledger);
    const kingDeath = deaths[0].authorizedDeaths.find(
      (d) => d.authorizedVictimId === 'king',
    )!;
    const chronology = checkmateChronology(ledger, kingDeath);
    expect(chronology).toContain('while he is alive');
    expect(chronology).toContain('passive movement of a corpse');
    expect(chronology).toContain('no strict order between the two deaths');
    const obligations = buildSceneObligations(ledger, [], deaths, [], [], []);
    expect(
      obligations.find((o) => o.id === '42:death:king')!.requirement,
    ).toContain(chronology);
    const contract = buildSceneFactContracts(
      ledger,
      [{ ply: 42, characters: [], fantasyNarration: '' }],
      obligations,
      [],
      deaths,
      [],
    )[0];
    expect(contract.facts.find((f) => f.id === '42:death:king')).toMatchObject({
      requiredReview: true,
      pieceId: 'king',
    });
    expect(
      contract.facts.find((f) => f.id === '42:death:king')!.requirement,
    ).toContain(chronology);
    expect(
      checkmateChronology(
        ledger,
        deaths[0].authorizedDeaths.find(
          (d) => d.authorizedVictimId === 'defender',
        )!,
      ),
    ).toBe('');
  });

  it('does not instruct an ordinary capturing check to kill the king', () => {
    const ledger = mateLedger();
    ledger.events[0].isCheckmate = false;
    ledger.events[0].isCheck = true;
    const contract = buildSceneFactContracts(
      ledger,
      [{ ply: 42, characters: [], fantasyNarration: '' }],
      [],
      [],
      buildDeathContracts(ledger),
      [],
    )[0];
    const life = contract.facts.find((f) => f.id === '42:life')!;
    expect(life.requirement).toContain('the checked King remains alive');
    expect(life.requirement).not.toContain('requires BOTH');
    expect(contract.facts.some((f) => f.requiredReview)).toBe(false);
  });

  it.each(['contradiction', 'uncertain'] as const)(
    'routes a %s chronology verdict through existing review without a new pass',
    async (status) => {
      const ledger = mateLedger();
      ledger.events.unshift({
        ply: 41,
        pieceId: 'queen',
      } as GameLedger['events'][number]);
      const initial = [
        {
          startPly: 41,
          characters: ['queen'],
          fantasyNarration: 'Catrin advanced.',
        },
        {
          startPly: 42,
          characters: ['queen', 'king', 'defender'],
          fantasyNarration:
            'Catrin killed Eric and Gareth. Only then did new strain seize the dead King.',
        },
      ];
      // Scripted semantic verdict tests routing, not the live model's accuracy.
      const review = jest
        .fn()
        .mockImplementation(async ({ contracts, scenes }: ReviewRequest) => ({
          assessments: contracts.map((c) => ({
            contractId: c.id,
            checkedFactIds: c.facts.map((f) => f.id),
            issues:
              c.ply === 42 &&
              scenes
                .find((s) => s.ply === 42)!
                .fantasyNarration.includes('Only then')
                ? [
                    {
                      factId: '42:death:king',
                      status,
                      confidence: 'high',
                      actorId: 'queen',
                      affectedPieceId: 'king',
                      excerpt: 'Only then did new strain seize the dead King.',
                      reason: 'New strain is placed after death',
                    },
                  ]
                : [],
          })),
        }));
      const session = new SceneFactReviewSession(
        'observe',
        review,
        telemetry,
        jest.fn(),
      );
      const repair = jest
        .fn()
        .mockResolvedValue([
          {
            ply: 42,
            fantasyNarration:
              'Gareth staggered under the strain. Catrin cut through Eric and drove her blade through Gareth. Both died; the Royal Seal broke and Southern magic stopped.',
          },
        ]);
      const result = await coordinateSceneRepairs({
        scenes: initial,
        validate: async (candidate, round) => {
          const scenes = candidate.map((s) => ({ ...s, ply: s.startPly }));
          return session.validate(
            buildSceneFactContracts(
              ledger,
              scenes,
              [],
              [],
              buildDeathContracts(ledger),
              [],
            ),
            scenes,
            round,
          );
        },
        repair,
        apply: (scene, fantasyNarration) => ({ ...scene, fantasyNarration }),
        record: async () => {},
      });
      expect(result.scenes[0]).toEqual(initial[0]);
      expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
      expect(repair).toHaveBeenCalledTimes(status === 'contradiction' ? 1 : 0);
      expect(review).toHaveBeenCalledTimes(status === 'contradiction' ? 2 : 1);
      if (status === 'contradiction')
        expect(repair.mock.calls[0][1]).toEqual([42]);
      else
        expect(result.findings.some((f) => f.severity === 'warning')).toBe(
          true,
        );
    },
  );

  it('rejects incomplete ledger death contracts instead of silently skipping mandatory review', () => {
    const ledger = mateLedger();
    expect(() =>
      buildSceneFactContracts(
        ledger,
        [{ ply: 42, characters: [], fantasyNarration: 'The King died.' }],
        [],
        [],
        [],
        [],
      ),
    ).toThrow('Incomplete checkmate death contract');
  });

  it('routes a missing king death to only the broken scene, then rechecks its replacement', async () => {
    const ledger = mateLedger();
    ledger.events.unshift({
      ply: 41,
      pieceId: 'queen',
    } as GameLedger['events'][number]);
    const initial = [
      {
        startPly: 41,
        characters: ['queen'],
        fantasyNarration: 'Catrin advanced.',
      },
      {
        startPly: 42,
        characters: ['queen', 'defender', 'king'],
        fantasyNarration: 'Catrin killed Eric. Gareth stood surrounded.',
      },
    ];
    const provider = jest
      .fn()
      .mockImplementation(async ({ contracts, scenes }: ReviewRequest) => ({
        assessments: contracts.map((c) => ({
          contractId: c.id,
          checkedFactIds: c.facts.map((f) => f.id),
          issues:
            c.ply === 42 &&
            !scenes
              .find((s) => s.ply === 42)!
              .fantasyNarration.includes('Gareth died')
              ? [
                  {
                    factId: '42:death:king',
                    status: 'omitted',
                    confidence: 'high',
                    actorId: 'queen',
                    affectedPieceId: 'king',
                    excerpt: 'Gareth stood surrounded.',
                    reason: 'King death missing',
                  },
                ]
              : [],
        })),
      }));
    const session = new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    );
    const repair = jest.fn().mockResolvedValue([
      {
        ply: 42,
        fantasyNarration:
          'Catrin killed Eric, then pierced Gareth with her sword. Gareth died.',
      },
    ]);
    const result = await coordinateSceneRepairs({
      scenes: initial,
      validate: async (candidate, round) => {
        const input = candidate.map((s) => ({ ...s, ply: s.startPly }));
        return session.validate(
          buildSceneFactContracts(
            ledger,
            input,
            [],
            [],
            buildDeathContracts(ledger),
            [],
          ),
          input,
          round,
        );
      },
      repair,
      apply: (scene, fantasyNarration) => ({ ...scene, fantasyNarration }),
      record: async () => {},
    });
    expect(repair).toHaveBeenCalledTimes(1);
    expect(repair.mock.calls[0][1]).toEqual([42]);
    expect(result.scenes[0]).toEqual(initial[0]);
    expect(result.findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it.each(['observe', 'off', 'enforce'] as const)(
    'requires an individual verdict for both deaths in %s mode',
    async (mode) => {
      const ledger = mateLedger();
      const scenes = [
        {
          ply: 42,
          characters: ['queen', 'defender', 'king'],
          fantasyNarration:
            'Catrin killed Eric. King Gareth stood surrounded as she advanced.',
        },
      ];
      const contracts = buildSceneFactContracts(
        ledger,
        scenes,
        [],
        [],
        buildDeathContracts(ledger),
        [],
      );
      const required = contracts[0].facts.filter((f) => f.requiredReview);
      expect(required.map((f) => f.pieceId).sort()).toEqual([
        'defender',
        'king',
      ]);
      for (const fact of required)
        expect(fact.requirement).toContain('"decisiveActorId":"queen"');
      const provider = jest
        .fn()
        .mockImplementation(async ({ contracts: supplied }: ReviewRequest) => ({
          assessments: supplied.map((c) => ({
            contractId: c.id,
            checkedFactIds: c.facts.map((f) => f.id),
            issues: [
              {
                factId: '42:death:king',
                status: 'omitted',
                confidence: 'high',
                actorId: 'queen',
                affectedPieceId: 'king',
                excerpt: 'King Gareth stood surrounded as she advanced.',
                reason: 'The defender died, but the King did not.',
              },
            ],
          })),
        }));
      const session = new SceneFactReviewSession(
        mode,
        provider,
        telemetry,
        jest.fn(),
      );
      const semantic = await session.validate(contracts, scenes, 0);
      const combined = combineSceneFindings(
        mode,
        validator.validateCheckmateKingDeath(scenes, ledger),
        semantic,
      );
      expect(combined).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          pieceId: 'king',
          factId: '42:death:king',
        }),
      );
      await session.validate(contracts, scenes, 1);
      expect(provider).toHaveBeenCalledTimes(1);
    },
  );

  it('accepts independently satisfied deaths, and does not treat uncertainty as a prose error', async () => {
    const ledger = mateLedger();
    const scenes = [
      {
        ply: 42,
        characters: ['queen', 'defender', 'king'],
        fantasyNarration:
          'Catrin killed Eric and then killed Gareth with her sword.',
      },
    ];
    const contracts = buildSceneFactContracts(
      ledger,
      scenes,
      [],
      [],
      buildDeathContracts(ledger),
      [],
    );
    const provider = jest
      .fn()
      .mockImplementation(async ({ contracts: supplied }: ReviewRequest) => ({
        assessments: supplied.map((c) => ({
          contractId: c.id,
          checkedFactIds: c.facts.map((f) => f.id),
          issues: [],
        })),
      }));
    expect(
      await new SceneFactReviewSession(
        'observe',
        provider,
        telemetry,
        jest.fn(),
      ).validate(contracts, scenes, 0),
    ).toEqual([]);
    provider.mockImplementation(
      async ({ contracts: supplied }: ReviewRequest) => ({
        assessments: supplied.map((c) => ({
          contractId: c.id,
          checkedFactIds: c.facts.map((f) => f.id),
          issues: [
            {
              factId: '42:death:king',
              status: 'uncertain',
              confidence: 'low',
              actorId: null,
              affectedPieceId: null,
              excerpt: scenes[0].fantasyNarration,
              reason: 'Uncertain reading',
            },
          ],
        })),
      }),
    );
    const uncertain = await new SceneFactReviewSession(
      'observe',
      provider,
      telemetry,
      jest.fn(),
    ).validate(contracts, scenes, 0);
    expect(uncertain.every((f) => f.severity === 'warning')).toBe(true);
  });

  it('does not silently pass an unavailable mandatory check or regenerate prose for an API failure', async () => {
    const ledger = mateLedger();
    const scenes = [
      {
        ply: 42,
        characters: ['king'],
        fantasyNarration: 'The King was surrounded.',
      },
    ];
    const contracts = buildSceneFactContracts(
      ledger,
      scenes,
      [],
      [],
      buildDeathContracts(ledger),
      [],
    );
    const provider = jest.fn().mockResolvedValue({ assessments: [] });
    await expect(
      new SceneFactReviewSession(
        'observe',
        provider,
        telemetry,
        jest.fn(),
      ).validate(contracts, scenes, 0),
    ).rejects.toBeInstanceOf(SceneValidationUnavailableError);
    expect(provider).toHaveBeenCalledTimes(2);
  });

  it('never guesses equipment in validation or repair contracts, but preserves known legacy assignments', () => {
    const piece = {
      id: 'commander',
      permanentName: 'Northern Knight Commander',
      characterName: 'Evander',
      fantasyType: 'knight-commander',
      originalSquare: 'b1',
      backstory: 'A veteran of many wars.',
    } as PieceIdentity;
    const ledger = {
      initialFen: 'fixture',
      pieces: [piece],
      events: [],
    } as unknown as GameLedger;
    const scenes = [
      {
        ply: 1,
        characters: [piece.id],
        fantasyNarration: 'Evander wielded the stormbound great hammer.',
      },
    ];
    expect(establishedMythicArm(piece)).toBeNull();
    expect(attackCapabilities(piece)).toBeNull();
    expect(validator.validateMythicArmOwnership(scenes, ledger)).toEqual([]);
    expect(buildMythicArmRepairContracts(ledger, [1], scenes, [])).toEqual([]);
    piece.backstory = `He wielded ${MYTHIC_ARMS[5].signatures[0]}.`;
    expect(establishedMythicArm(piece)?.id).toBe(MYTHIC_ARMS[5].id);
    expect(validator.validateMythicArmOwnership(scenes, ledger)).toHaveLength(
      1,
    );
    expect(
      buildMythicArmRepairContracts(ledger, [1], scenes, [])[0].assignedArm.id,
    ).toBe(MYTHIC_ARMS[5].id);
    piece.backstory += ` He once faced ${MYTHIC_ARMS[0].signatures[0]}.`;
    expect(establishedMythicArm(piece)).toBeNull();
  });

  it('does not impose future promoted equipment on a pawn', () => {
    const piece = {
      id: 'pawn',
      characterName: 'Evander',
      permanentName: 'Evander',
      fantasyType: 'knight-commander',
      mythicArm: MYTHIC_ARMS[5],
    } as unknown as PieceIdentity;
    const ledger = {
      pieces: [piece],
      events: [{ pieceId: piece.id, ply: 20, isPromotion: true }],
    } as GameLedger;
    const scene = {
      ply: 19,
      characters: [piece.id],
      fantasyNarration: 'Evander wielded the stormbound great hammer.',
    };
    expect(validator.validateMythicArmOwnership([scene], ledger)).toEqual([]);
    expect(
      validator.validateMythicArmOwnership([{ ...scene, ply: 20 }], ledger),
    ).toHaveLength(1);
  });

  it.each(['high', 'medium', 'low'] as const)(
    'only a high-confidence death contradiction blocks (%s)',
    async (confidence) => {
      const f: ValidationFinding = {
        type: 'survivor-killed',
        severity: 'error',
        ply: 1,
        pieceId: 'king',
        excerpt: 'his death',
        message: 'Ambiguous death',
        deathAttribution: 'pronoun-inferred',
      };
      const service = Object.assign(Object.create(FullStoryService.prototype), {
        provider: {
          adjudicatePossiblePrematureDeaths: jest.fn().mockResolvedValue({
            findings: [{ findingIndex: 0, contradiction: true, confidence }],
          }),
        },
        logger: { log: jest.fn(), warn: jest.fn() },
      }) as FullStoryService;
      const result = await service['adjudicateAmbiguousTimedFates'](
        { findings: [f], timedFateFindings: [f] } as ScenePackageValidation,
        [{ startPly: 1, fantasyNarration: 'He feared his death.' }],
        mateLedger(),
        'test',
        'test',
        1,
      );
      expect(result.findings[0].severity).toBe(
        confidence === 'high' ? 'error' : 'warning',
      );
    },
  );

  it.each(
    [[], [{ findingIndex: 4 }], [{ findingIndex: 0 }, { findingIndex: 0 }]].map(
      (decisions) => ({ decisions }),
    ),
  )(
    'keeps incomplete/duplicate decisions nonblocking without erasing unrelated errors ($decisions)',
    async ({ decisions }) => {
      const f: ValidationFinding = {
        type: 'survivor-killed',
        severity: 'error',
        ply: 1,
        pieceId: 'king',
        excerpt: 'his death',
        message: 'Ambiguous death',
        deathAttribution: 'pronoun-inferred',
      };
      const unrelated: ValidationFinding = {
        ...f,
        type: 'missing-wound',
        message: 'Required wound missing',
      };
      const service = Object.assign(Object.create(FullStoryService.prototype), {
        provider: {
          adjudicatePossiblePrematureDeaths: jest.fn().mockResolvedValue({
            findings: decisions.map((d) => ({
              ...d,
              contradiction: true,
              confidence: 'high',
            })),
          }),
        },
        logger: { log: jest.fn(), warn: jest.fn() },
      }) as FullStoryService;
      const result = await service['adjudicateAmbiguousTimedFates'](
        {
          findings: [f, unrelated],
          timedFateFindings: [f],
        } as ScenePackageValidation,
        [{ startPly: 1, fantasyNarration: 'He feared his death.' }],
        mateLedger(),
        'test',
        'test',
        1,
      );
      expect(result.findings.map((x) => x.severity)).toEqual([
        'warning',
        'error',
      ]);
      expect(result.findings[0].message).toContain('unavailable');
    },
  );

  it.each([
    'executed-after-rejected-surrender',
    'spends-seal-to-save-subjects',
    'refuses-seal-destruction-and-is-imprisoned',
  ] as const)('carries ending fate into character state (%s)', (fate) => {
    const ledger = mateLedger();
    ledger.metadata.termination = 'resignation';
    ledger.events[0].isCheckmate = false;
    const analysis = {
      endingPlan: { defeatedKingFate: fate },
      surrenderContext: null,
    } as unknown as NarrativeAnalysis;
    // Only the execution case creates an additional narrative death.
    const execution = buildEndingDeathContract(ledger, analysis);
    const world = buildEndingWorldState(ledger, analysis);
    const input = buildEndingFactContracts(
      ledger,
      [],
      buildDeathContracts(ledger),
      [],
      world,
      [{ sectionId: 'immediate-aftermath', text: 'Gareth was remembered.' }],
      '',
      execution,
    );
    expect(world.defeatedKingFate).toBe(fate);
    expect(
      input.contracts[0].characters.find((c) => c.pieceId === 'king')
        ?.lifeAtEnd,
    ).toBe(fate === 'executed-after-rejected-surrender' ? 'dead' : 'alive');
  });
});
