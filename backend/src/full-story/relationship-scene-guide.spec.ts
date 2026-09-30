import {
  buildRelationshipSceneGuide,
  buildQuietSceneGuide,
  buildEndingActionGuide,
  buildCharacterThreadGuide,
  buildCharacterRepairGuide,
  buildCharacterRepairContext,
} from './relationship-scene-guide';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';

describe('optional character threads', () => {
  function setup() {
    const { ledger, outline } = fixture();
    ledger.events.forEach((event, index) => {
      event.ply = index + 1;
      event.isQuietMove = true;
    });
    outline.relationshipBeats = [];
    outline.characterThreads = [
      {
        pieceId: 'a',
        personalWant: 'Keep command',
        personalStake: 'Lose authority',
        initialBehavior: 'Refuses advice',
        endingConnection: 'Loses command after the refusal',
        moments: [1, 3, 5].map((ply) => ({
          ply,
          choiceOrReaction: 'Refuses advice',
          changeFromEarlier: 'Doubt grows',
        })),
      },
    ];
    return { ledger, outline };
  }

  it('features solo moments without requiring relationships', () => {
    const { ledger, outline } = setup();
    expect(buildQuietSceneGuide(ledger, outline)[0].treatment).toBe(
      'featured-character-beat',
    );
    expect(buildQuietSceneGuide(ledger, outline)[1].treatment).toBe(
      'brief-connection',
    );
  });

  it('carries a specific unfinished concern without leaking future moments', () => {
    const { ledger, outline } = setup();
    const before = JSON.stringify({ ledger, outline });
    const guide = buildQuietSceneGuide(ledger, outline);
    expect(guide.map((g) => g.ply)).toEqual([1, 2, 3, 4, 5]);
    expect(
      guide[0].authorOnlyDirection.characterFocus[0].previousMoment,
    ).toBeNull();
    expect(guide[1].authorOnlyDirection.characterFocus).toEqual([]);
    const focus = guide[2].authorOnlyDirection.characterFocus[0];
    expect(focus).toMatchObject({
      pieceId: 'a',
      personalWant: 'Keep command',
      personalStake: 'Lose authority',
      previousMoment: { ply: 1 },
      currentMoment: {
        ply: 3,
        choiceOrReaction: 'Refuses advice',
        changeFromEarlier: 'Doubt grows',
      },
    });
    expect(focus).not.toHaveProperty('endingConnection');
    expect(focus).not.toHaveProperty('moments');
    expect(JSON.stringify({ ledger, outline })).toBe(before);
  });

  it('keeps a supported non-mover thread distinct from the moving character', () => {
    const { ledger, outline } = setup();
    ledger.events[2].pieceId = 'b';
    const guide = buildQuietSceneGuide(ledger, outline)[2];
    expect(guide.pieceId).toBe('b');
    expect(guide.treatment).toBe('featured-character-beat');
    expect(guide.authorOnlyDirection.characterFocus[0].pieceId).toBe('a');
    expect(
      guide.authorOnlyDirection.characterFocus[0].currentMoment.eventFacts
        .characterRole,
    ).toBe('no-established-direct-involvement');
  });

  it('keeps the actual actor distinct from a thread character who witnessed the kill', () => {
    const { ledger, outline } = setup();
    ledger.events[0].pieceId = 'other';
    ledger.events[0].capturedPieceId = 'victim';
    ledger.events[0].interactionContext = {
      adjacentAllyPieceIds: [],
      avengesDeaths: [],
      witnessedCapture: {
        killerPieceId: 'other',
        victimPieceId: 'victim',
        witnessPieceIds: ['a'],
      },
    };
    const thread = outline.characterThreads![0];
    thread.moments[1].respondsToPly = 1;
    thread.moments[2].respondsToPly = 5;
    thread.endingSetupPly = 99;
    const guide = buildCharacterThreadGuide(ledger, outline)[0];
    expect(guide.moments[0].eventFacts).toMatchObject({
      moverId: 'other',
      victimId: 'victim',
      characterRole: 'recorded-witness',
    });
    expect(guide.moments[1].respondsToPly).toBe(1);
    expect(guide.moments[2].respondsToPly).toBeNull();
    expect(guide.endingSetupPly).toBeNull();
    ledger.events[0].interactionContext.witnessedCapture!.witnessPieceIds = [];
    expect(
      buildCharacterThreadGuide(ledger, outline)[0].moments[1].respondsToPly,
    ).toBeNull();
    expect(
      buildCharacterThreadGuide(ledger, outline)[0].moments[0].eventFacts
        .characterRole,
    ).toBe('no-established-direct-involvement');
  });

  it('supplies bounded actual earlier prose and excludes other repair targets', () => {
    const { ledger, outline } = setup();
    outline.characterThreads![0].endingSetupPly = 1;
    const scenes = [1, 3, 5].map((startPly) => ({
      startPly,
      fantasyNarration: 'x'.repeat(2100),
    }));
    const context = buildCharacterRepairContext(
      ledger,
      outline,
      [3, 5],
      scenes,
    );
    expect(context[0].earlierScenes.map((s) => s.ply)).toEqual([1]);
    expect(context[1].earlierScenes.map((s) => s.ply)).toEqual([1]);
    expect(context[0].earlierScenes[0].text).toHaveLength(2000);
    expect(context[0].earlierScenes[0].truncated).toBe(true);
    expect(buildCharacterThreadGuide(ledger, outline)[0].endingSetupPly).toBe(
      1,
    );
  });

  it('drops unknown characters and moments after capture without blocking', () => {
    const { ledger, outline } = setup();
    ledger.pieces[0].capturedAtPly = 3;
    outline.characterThreads!.push({
      ...outline.characterThreads![0],
      pieceId: 'missing',
    });
    expect(
      buildCharacterThreadGuide(ledger, outline).map((t) =>
        t.moments.map((m) => m.ply),
      ),
    ).toEqual([[1, 3]]);
  });

  it('gives repair only current intent and earlier references, not future payoff', () => {
    const { ledger, outline } = setup();
    const guide = buildCharacterRepairGuide(ledger, outline, [3]);
    expect(guide).toHaveLength(1);
    expect(guide[0].earlierMomentPlies).toEqual([1]);
    expect(guide[0].authorOnlyMoment.ply).toBe(3);
    expect(guide[0]).not.toHaveProperty('endingConnection');
    expect(
      buildCharacterThreadGuide(ledger, {
        ...outline,
        characterThreads: undefined,
      }),
    ).toEqual([]);
  });
});

function fixture() {
  return {
    ledger: {
      pieces: [
        { id: 'a', battleDisposition: 'ruthless' },
        { id: 'b', capturedAtPly: 3 },
      ],
      events: Array.from({ length: 5 }, () => ({
        pieceId: 'a',
        interactionContext: { adjacentAllyPieceIds: ['b'] },
      })),
    } as unknown as GameLedger,
    analysis: {
      relationshipPlans: [
        {
          id: 'bond',
          characterIds: ['a', 'b'],
          startingDynamic: 'Distrust',
          payoffPly: 3,
        },
      ],
    } as unknown as NarrativeAnalysis,
    outline: {
      relationshipBeats: [
        {
          relationshipId: 'bond',
          characterIds: ['a', 'b'],
          beatPlies: [3, 1, 3, 5],
          progression: 'Demand an explanation',
          payoff: 'Refuse the order',
        },
      ],
      acts: [
        {
          scenes: [
            {
              startPly: 1,
              endPly: 5,
              characters: ['a', 'b'],
              purpose: 'Advance',
              emotionalBeat: 'Refuse secrecy',
              continuityNotes: ['Future plan'],
            },
          ],
        },
      ],
    } as unknown as StoryOutline,
  };
}

describe('optional scene guidance', () => {
  it('links the same mover without treating a spanning scene as prior knowledge', () => {
    const { ledger, outline } = fixture();
    ledger.events = [
      { ply: 1, pieceId: 'a', isQuietMove: true },
      { ply: 2, pieceId: 'b', isQuietMove: true },
      { ply: 3, pieceId: 'a', isQuietMove: false },
      { ply: 4, pieceId: 'a', isQuietMove: true },
    ] as GameLedger['events'];
    const guide = buildQuietSceneGuide(ledger, outline);
    expect(guide.map((g) => [g.ply, g.previousMovePly])).toEqual([
      [1, null],
      [2, null],
      [4, 3],
    ]);
    expect(guide.every((g) => g.previousSceneEndPly === null)).toBe(true);
    expect(guide[2].authorOnlyDirection.currentEmotionalBeat).toBe(
      'Refuse secrecy',
    );
  });

  it('falls back for absent or unknown-character ending guidance without failing', () => {
    const { ledger, outline } = fixture();
    expect(buildEndingActionGuide(ledger, outline)).toBeNull();
    const section = {
      viewpointPieceId: 'a',
      objective: 'Leave',
      action: 'Close gate',
      causeAndResult: 'Gate blocks pursuit',
      irreversibleCost: 'Abandon the road',
      finalPositions: [{ pieceId: 'a', positionAndCondition: 'Outside' }],
    };
    outline.endingActionPlan = { aftermath: section, laterChronicle: section };
    expect(buildEndingActionGuide(ledger, outline)).toEqual(
      outline.endingActionPlan,
    );
    outline.endingActionPlan = {
      aftermath: section,
      laterChronicle: { ...section, viewpointPieceId: 'unknown' },
    };
    expect(buildEndingActionGuide(ledger, outline)).toBeNull();
  });
});
describe('relationship scene guide', () => {
  it('sorts and deduplicates plies, omits post-death meetings and isolates future plans', () => {
    const f = fixture();
    const before = structuredClone(f);
    const guide = buildRelationshipSceneGuide(f.ledger, f.analysis, f.outline);
    expect(guide.map((g) => g.ply)).toEqual([1, 3]);
    expect(guide[0].earlierInteractionPlies).toEqual([]);
    expect(guide[1].earlierInteractionPlies).toEqual([1]);
    expect(guide[0].authorOnlyPlan.eventualPayoff).toBe('Refuse the order');
    expect(guide[0].nearbyAllies).toBe(true);
    expect(f).toEqual(before);
  });
  it('falls back for unknown relationships and mismatched participants', () => {
    const f = fixture();
    f.analysis.relationshipPlans = [];
    expect(
      buildRelationshipSceneGuide(f.ledger, f.analysis, f.outline),
    ).toEqual([]);
    const g = fixture();
    g.outline.relationshipBeats[0].characterIds = ['a', 'missing'];
    expect(
      buildRelationshipSceneGuide(g.ledger, g.analysis, g.outline),
    ).toEqual([]);
  });
  it('does not infer a conversation from unrelated board movement', () => {
    const f = fixture();
    f.ledger.events[0].pieceId = 'outsider';
    expect(
      buildRelationshipSceneGuide(f.ledger, f.analysis, f.outline)[0]
        .nearbyAllies,
    ).toBe(false);
  });
});
