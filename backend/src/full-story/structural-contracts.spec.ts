import { Chess } from 'chess.js';
import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { buildDeathContracts, buildWoundTimeline } from './full-story.service';
import { buildSceneObligations } from './scene-obligations';
import {
  buildSceneFactContracts,
  sceneFactFindings,
} from './scene-fact-contracts';
import { buildEndingFactContracts } from './ending-fact-contracts';
import { groundedExcerpt } from './review-evidence';
import type {
  WoundTimelineDirective,
  EndingWorldState,
} from './full-story.provider';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import { zodTextFormat } from 'openai/helpers/zod';
import { woundPlanSchema } from '../narrative-analysis/models/narrative-analysis';
import { storyWoundSchema } from './models/generated-story';
import { storyOutlineGenerationSchema } from '../story-outline/models/story-outline';

// The exact moves behind Yvette Beneath the Temple Rain. No network or paid calls.
const moves =
  '1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7#';
function ledgerFor(pgn = moves) {
  const board = new Chess();
  const initial = board.fen();
  board.loadPgn(pgn);
  return new GameLedgerService(new PieceIdentityService()).build(
    {
      White: 'Adolf Anderssen',
      Black: 'Jean Dufresne',
      Date: '1852.??.??',
      Result: '1-0',
    },
    board.history({ verbose: true }),
    initial,
  );
}
describe('structural contract regressions', () => {
  it('keeps injury sites compatible with legacy data and strict generation schemas', () => {
    for (const schema of [
      woundPlanSchema,
      storyWoundSchema,
      storyOutlineGenerationSchema.shape.woundBeats.unwrap().element,
    ]) {
      expect(schema.shape.injurySite.parse(undefined)).toBeUndefined();
      expect(schema.shape.injurySite.parse(null)).toBeNull();
      const json = zodTextFormat(schema, 'wound').schema as {
        required: string[];
      };
      expect(json.required).toContain('injurySite');
    }
  });
  it('retains both capture and checkmate deaths, each with its own method and obligation ID', () => {
    const ledger = ledgerFor();
    const deaths = buildDeathContracts(ledger);
    expect(deaths[0].authorizedDeaths).toEqual([]);
    expect(deaths[7].authorizedDeaths).toHaveLength(1);
    const final = deaths.at(-1)!;
    expect(
      final.authorizedDeaths.map((d) => [
        d.authorizedVictimId,
        d.decisiveActorId,
        d.eventKind,
      ]),
    ).toEqual([
      ['b-n-b8', 'w-b-c1', 'capture'],
      ['b-k-e8', 'w-b-c1', 'checkmate'],
    ]);
    expect(final.authorizedDeaths.every((d) => d.deathCatalogId)).toBe(true);
    const obligations = buildSceneObligations(ledger, [], deaths, [], [], []);
    expect(new Set(obligations.map((o) => o.id)).size).toBe(obligations.length);
    expect(
      obligations.filter((o) => o.id.startsWith('47:death:')),
    ).toHaveLength(2);
    const contracts = buildSceneFactContracts(
      ledger,
      [{ ply: 47, characters: [], fantasyNarration: '' }],
      obligations,
      [],
      deaths,
      [],
    );
    for (const id of ['b-k-e8', 'b-n-b8'])
      expect(
        contracts[0].characters.find((c) => c.pieceId === id)?.lifeAtEnd,
      ).toBe('dead');
    expect(
      contracts[0].facts.find((f) => f.id === '47:life')?.requirement,
    ).toContain('No other character may die');
  });
  it('permits only the king on a non-capturing mate', () => {
    const deaths = buildDeathContracts(ledgerFor('1. f3 e5 2. g4 Qh4#'));
    expect(
      deaths.at(-1)!.authorizedDeaths.map((d) => d.authorizedVictimId),
    ).toEqual(['w-k-e1']);
  });
  it('carries recorded wound sites without guessing a new site for legacy wounds', () => {
    const ledger = ledgerFor();
    const plan = {
      pieceId: 'w-b-c1',
      inflictedAtPly: 47,
      woundCatalogId: 'deep-burns',
      injurySite: 'chest',
      injury: 'Burns across upper torso',
      lastingEffects: ['Pain'],
      recoveryPly: null,
      causeType: 'victim-retaliation',
      sourcePieceId: 'b-n-b8',
    };
    const analysis = { woundPlans: [plan] } as unknown as NarrativeAnalysis;
    const outline = { woundBeats: [plan] } as unknown as StoryOutline;
    expect(buildWoundTimeline(ledger, analysis, outline)[0].injurySite).toBe(
      'chest',
    );
    const legacy = { ...plan, injurySite: undefined };
    expect(
      buildWoundTimeline(
        ledger,
        { woundPlans: [legacy] } as unknown as NarrativeAnalysis,
        { woundBeats: [legacy] } as unknown as StoryOutline,
      )[0].injurySite,
    ).toBeNull();
  });
  it('ending snapshots preserve old torso burns and do not adopt claims of an old burned arm', () => {
    const ledger = ledgerFor();
    const deaths = buildDeathContracts(ledger);
    const wounds = [
      {
        pieceId: 'w-b-c1',
        inflictedAtPly: 47,
        recoveryPly: null,
        injurySite: 'chest',
        injury: 'Upper torso burns',
      },
    ] as WoundTimelineDirective[];
    const input = buildEndingFactContracts(
      ledger,
      wounds,
      deaths,
      [],
      {} as EndingWorldState,
      [
        {
          sectionId: 'immediate-aftermath',
          text: 'Her burned arm had never healed.',
        },
        {
          sectionId: 'later-chronicles',
          text: 'A falling stone broke her previously uninjured arm.',
        },
      ],
      'Bram burned her upper torso.',
    );
    for (const c of input.contracts) {
      const yvette = c.characters.find((p) => p.pieceId === 'w-b-c1')!;
      expect(yvette.enteringWounds[0].injurySite).toBe('chest');
      expect(yvette.newWounds).toEqual([]);
      expect(c.facts[0].requirement).toContain(
        'New harm or deterioration may occur',
      );
      expect(c.facts[1].requirement).toContain(
        'voice, memory, surviving consciousness',
      );
    }
    // Recorded reviewer evidence is routed; this does not claim to test model accuracy.
    const c = input.contracts[0];
    const findings = sceneFactFindings([c], [input.scenes[0]], {
      assessments: [
        {
          contractId: c.id,
          checkedFactIds: c.facts.map((f) => f.id),
          issues: [
            {
              factId: c.facts[0].id,
              status: 'contradiction',
              confidence: 'high',
              actorId: null,
              affectedPieceId: 'w-b-c1',
              excerpt: '“Her burned arm had never healed.”',
              reason: 'The old wound is on the torso, not the arm',
            },
          ],
        },
      ],
    });
    expect(findings[0].severity).toBe('error');
    expect(findings[0].excerpt).toBe('Her burned arm had never healed.');
  });
  it('never fuzzy-matches changed words or names in evidence', () => {
    expect(groundedExcerpt('Yvette was burned.', '“Yvette was burned.”')).toBe(
      'Yvette was burned.',
    );
    expect(
      groundedExcerpt('Yvette was burned.', '“Bram was burned.”'),
    ).toBeNull();
    expect(
      groundedExcerpt('Yvette was burned.', '“Yvette was wounded.”'),
    ).toBeNull();
    expect(groundedExcerpt('Yvette was burned.', '“”')).toBeNull();
  });
});
