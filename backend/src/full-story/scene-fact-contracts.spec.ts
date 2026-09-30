import { zodTextFormat } from 'openai/helpers/zod';
import type { GameLedger } from '../chess/models/game-ledger';
import { buildSceneObligations } from './scene-obligations';
import type { WoundTimelineDirective } from './full-story.provider';
import {
  buildSceneFactContracts,
  combineSceneFindings,
  factReviewMode,
  sceneFactFindings,
  sceneFactReviewSchema,
  type SceneFactReview,
} from './scene-fact-contracts';

const prose =
  'Sabine caught his first strike, but he trapped one of her hands against a root and crushed the bones with a brutal wrench; the hand remained attached but could no longer hold her weapon properly. Sabine tried to release a cutting arc with her remaining oathbound sword, yet the ruined grip spoiled the motion. Evander swung his blade across her neck and severed her head.';
export const factFixture = () => {
  const ledger = {
    initialFen: 'fixture',
    pieces: [
      {
        id: 'evander',
        characterName: 'Evander',
        fantasyType: 'grunt',
        capturedAtPly: 21,
      },
      {
        id: 'sabine',
        characterName: 'Sabine',
        fantasyType: 'knight-commander',
        capturedAtPly: 20,
        mythicArm: { id: 'force-storing-war-axe' },
      },
      {
        id: 'petra',
        characterName: 'Petra',
        fantasyType: 'grunt',
        capturedAtPly: 65,
      },
    ],
    events: [
      {
        ply: 20,
        pieceId: 'evander',
        capturedPieceId: 'sabine',
        isCapture: true,
      },
    ],
  } as unknown as GameLedger;
  const wounds = [
    {
      woundId: 'wound:evander:20',
      pieceId: 'evander',
      characterNames: ['Evander'],
      sourcePieceId: 'sabine',
      sourceNames: ['Sabine'],
      injury: 'One hand is crushed',
      inflictedAtPly: 20,
      recoveryPly: null,
      woundCatalogId: 'crushed-hand',
      lastingEffects: ['Reduced-grip'],
      causeType: 'victim-retaliation',
    },
  ] as WoundTimelineDirective[];
  const deaths = [
    {
      ply: 20,
      noOtherDeaths: true,
      authorizedDeaths: [
        {
          ply: 20,
          authorizedVictimId: 'sabine',
          authorizedVictimNames: ['Sabine'],
          noOtherDeaths: true,
          deathCatalogId: null,
          eventKind: 'capture',
          decisiveActorId: 'evander',
          decisiveActorNames: ['Evander'],
          method: null,
          targetArea: null,
          narrationGuidance: null,
          forbiddenClaims: [],
        },
      ],
    },
  ] as const;
  const scenes = [
    { ply: 20, fantasyNarration: prose, characters: ['evander'] },
  ];
  const obligations = buildSceneObligations(
    ledger,
    [],
    [...deaths],
    [],
    wounds,
    [],
  );
  const contracts = buildSceneFactContracts(
    ledger,
    scenes,
    obligations,
    wounds,
    [...deaths],
    [],
  );
  return { ledger, wounds, scenes, contracts };
};
const assessed = (
  contracts: ReturnType<typeof factFixture>['contracts'],
): SceneFactReview => ({
  assessments: contracts.map((c) => ({
    contractId: c.id,
    checkedFactIds: c.facts.map((f) => f.id),
    issues: [],
  })),
});

describe('scene factual contracts', () => {
  it('separates the real injury recipient from the capture victim, including both despite incomplete cast metadata', () => {
    const { contracts } = factFixture();
    const c = contracts[0];
    expect(c.characters.find((p) => p.pieceId === 'evander')).toMatchObject({
      enteringWounds: [],
      newWounds: [expect.objectContaining({ sourcePieceId: 'sabine' })],
      lifeAtEnd: 'alive',
    });
    expect(c.characters.find((p) => p.pieceId === 'sabine')).toMatchObject({
      newWounds: [],
      lifeAtEnd: 'dead',
      assignedArm: { id: 'force-storing-war-axe' },
    });
    expect(c.facts.map((f) => f.id)).toContain('20:equipment:sabine');
  });
  it('keeps entering wounds while a new one is scheduled', () => {
    const { ledger, wounds, scenes } = factFixture();
    const existing = {
      ...wounds[0],
      woundId: 'earlier-eye',
      inflictedAtPly: 10,
      woundCatalogId: 'impaired-eye' as const,
    };
    const c = buildSceneFactContracts(
      ledger,
      scenes,
      [],
      [existing, ...wounds],
      [],
      [],
    )[0];
    expect(
      c.characters
        .find((p) => p.pieceId === 'evander')!
        .enteringWounds.map((w) => w.woundId),
    ).toEqual(['earlier-eye']);
    expect(
      c.characters.find((p) => p.pieceId === 'evander')!.leavingWounds,
    ).toHaveLength(2);
  });
  it.each(['20:wound:evander:20', '20:equipment:sabine'])(
    'routes grounded observed contradiction %s to repair',
    (factId) => {
      const { contracts, scenes } = factFixture();
      const review = assessed(contracts);
      review.assessments[0].issues.push({
        factId,
        status: 'contradiction',
        confidence: 'high',
        actorId: 'evander',
        affectedPieceId: 'sabine',
        excerpt: scenes[0].fantasyNarration,
        reason: 'The prose does not match the required owner/equipment',
      });
      expect(sceneFactFindings(contracts, scenes, review)[0]).toMatchObject({
        severity: 'error',
        ply: 20,
      });
    },
  );
  it.each(['uncertain', 'ungrounded'])('does not block %s evidence', (kind) => {
    const { contracts, scenes } = factFixture();
    const review = assessed(contracts);
    review.assessments[0].issues.push({
      factId: '20:state:evander',
      status: kind === 'uncertain' ? 'uncertain' : 'contradiction',
      confidence: 'high',
      actorId: null,
      affectedPieceId: null,
      excerpt: kind === 'ungrounded' ? 'invented quotation' : prose,
      reason: 'Possible owner',
    });
    expect(sceneFactFindings(contracts, scenes, review)[0].severity).toBe(
      'warning',
    );
  });
  it('rejects omitted, duplicate and unknown coverage and invented actor IDs', () => {
    const { contracts, scenes } = factFixture();
    expect(() =>
      sceneFactFindings(contracts, scenes, { assessments: [] }),
    ).toThrow('coverage');
    const review = assessed(contracts);
    review.assessments[0].checkedFactIds[0] = 'unknown';
    expect(() => sceneFactFindings(contracts, scenes, review)).toThrow(
      'coverage',
    );
    const invalid = assessed(contracts);
    invalid.assessments[0].issues.push({
      factId: '20:state:evander',
      status: 'contradiction',
      confidence: 'high',
      actorId: 'unknown',
      affectedPieceId: null,
      excerpt: prose,
      reason: 'Invalid attribution',
    });
    expect(() => sceneFactFindings(contracts, scenes, invalid)).toThrow(
      'attribution',
    );
  });
  it('accepts satisfied two-character scenes without forcing additional events', () => {
    const { contracts, scenes } = factFixture();
    expect(sceneFactFindings(contracts, scenes, assessed(contracts))).toEqual(
      [],
    );
  });
  it('uses observation-only rollout and refuses invalid configuration', () => {
    expect(factReviewMode(undefined)).toBe('observe');
    expect(factReviewMode('enforce')).toBe('enforce');
    expect(() => factReviewMode('true')).toThrow('STORY_FACT_REVIEW_MODE');
  });
  it('creates a strict structured-output schema with nullable rather than optional fields', () => {
    expect(() => zodTextFormat(sceneFactReviewSchema, 'test')).not.toThrow();
  });
  it('only lets enforced semantic review decide prose-attribution candidates, never metadata errors', () => {
    const finding = {
      type: 'invented-wound' as const,
      severity: 'error' as const,
      ply: 20,
      pieceId: 'evander',
      excerpt: prose,
      message: 'Candidate',
    };
    expect(combineSceneFindings('observe', [finding], [])[0].severity).toBe(
      'error',
    );
    expect(combineSceneFindings('enforce', [finding], [])[0].severity).toBe(
      'warning',
    );
    expect(
      combineSceneFindings('enforce', [{ ...finding, excerpt: null }], [])[0]
        .severity,
    ).toBe('error');
  });
});
