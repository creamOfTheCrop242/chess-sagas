import {
  buildAllegianceContext,
  relationshipAllegiance,
  ALLEGIANCE_INSTRUCTIONS,
} from './allegiance-context';
import type { GameLedger } from './models/game-ledger';
import { NARRATIVE_ANALYSIS_INSTRUCTIONS } from '../narrative-analysis/narrative-analysis.prompt';
import { STORY_OUTLINE_INSTRUCTIONS } from '../story-outline/story-outline.prompt';
import { FULL_STORY_INSTRUCTIONS } from '../full-story/full-story.prompt';

const fixture = () =>
  ({
    pieces: [
      { id: 'queen', side: 'north', chessType: 'q' },
      { id: 'commander', side: 'south', chessType: 'n' },
      {
        id: 'pawn',
        side: 'north',
        chessType: 'p',
        fantasyType: 'queen',
        currentChessType: 'q',
      },
    ],
    events: Array.from({ length: 5 }, (_, i) => ({
      ply: i + 1,
      pieceId: 'pawn',
      isPromotion: i === 3,
      promotionType: i === 3 ? 'queen' : undefined,
    })),
  }) as unknown as GameLedger;

describe('ledger-derived allegiance', () => {
  it('does not give an enemy queen command authority over a commander', () => {
    expect(
      relationshipAllegiance(fixture(), ['queen', 'commander'], 1),
    ).toMatchObject({
      affiliation: 'opposing-armies',
      commandAuthority: 'no-shared-military-command',
      participants: [
        { pieceId: 'queen', side: 'north', role: 'queen' },
        { pieceId: 'commander', side: 'south', role: 'knight-commander' },
      ],
    });
  });
  it('does not infer command authority from allied status or rank alone', () => {
    expect(
      relationshipAllegiance(fixture(), ['queen', 'pawn'], 1),
    ).toMatchObject({
      affiliation: 'same-army',
      commandAuthority: 'not-established-by-allegiance-alone',
    });
  });
  it('keeps future promotions out of current roles and preserves allegiance', () => {
    expect(
      relationshipAllegiance(fixture(), ['pawn', 'commander'], 3)
        .participants[0].role,
    ).toBe('grunt');
    expect(
      relationshipAllegiance(fixture(), ['pawn', 'commander'], 4)
        .participants[0],
    ).toMatchObject({ role: 'queen', side: 'north' });
  });
  it('handles missing identities, missing sides, and duplicate participants without throwing', () => {
    expect(
      relationshipAllegiance(fixture(), ['queen', 'missing'], 1).affiliation,
    ).toBe('unknown');
    expect(
      relationshipAllegiance(fixture(), ['queen', 'queen'], 1).affiliation,
    ).toBe('unknown');
    const ledger = fixture();
    delete (ledger.pieces[0] as Partial<(typeof ledger.pieces)[0]>).side;
    expect(
      relationshipAllegiance(ledger, ['queen', 'pawn'], 1).affiliation,
    ).toBe('unknown');
  });
  it('builds selected-pair context without mutating inputs', () => {
    const ledger = fixture();
    const before = structuredClone(ledger);
    const context = buildAllegianceContext(ledger, [
      {
        id: 'rivalry',
        characterIds: ['queen', 'commander'],
        developmentPlies: [5, 1, 1, 0, 99],
      },
    ]);
    expect(context.selectedRelationships.map((r) => r.ply)).toEqual([1, 5]);
    expect(context.roster[2].initialRole).toBe('grunt');
    expect(context.authorOnlyPromotionTimeline).toEqual([
      { ply: 4, pieceId: 'pawn', role: 'queen' },
    ]);
    expect(ledger).toEqual(before);
  });
  it('gives all stages the same rules while allowing enemy dialogue', () => {
    for (const prompt of [
      NARRATIVE_ANALYSIS_INSTRUCTIONS,
      STORY_OUTLINE_INSTRUCTIONS,
      FULL_STORY_INSTRUCTIONS,
    ]) {
      expect(prompt).toContain(ALLEGIANCE_INSTRUCTIONS);
      expect(prompt).toContain('negotiation, deliberate mercy');
      expect(prompt).toContain('resistance, not insubordination');
    }
  });
});
