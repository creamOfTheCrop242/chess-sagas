import { buildRelationshipSceneGuide } from './relationship-scene-guide';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';

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
