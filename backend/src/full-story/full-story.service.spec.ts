import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import {
  buildEndingWorldState,
  buildStoryCorrectionFeedback,
  buildWoundTimeline,
} from './full-story.service';

describe('full-story wound timing preparation', () => {
  it('keeps a victorious surviving Fortress powered by its intact Seal', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'resignation' },
      pieces: [
        {
          id: 'b-r-a8',
          side: 'south',
          alive: true,
          fantasyType: 'moving-fortress',
          currentChessType: 'r',
          permanentName: 'Southeast Fortress',
          operatorName: 'Leoric',
        },
        {
          id: 'w-r-a1',
          side: 'north',
          alive: false,
          fantasyType: 'moving-fortress',
          currentChessType: 'r',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
      ],
    } as GameLedger;
    const analysis = {
      surrenderContext: {
        judgment: 'necessary',
        materialBalance: -14,
        legalMoveCount: 2,
        inCheck: true,
        safeFromImmediateMateMoveCount: 2,
        allowedFates: ['spends-seal-to-save-subjects'],
        rationale: 'Continued resistance would sacrifice civilians.',
      },
      endingPlan: {
        defeatedKingFate: 'spends-seal-to-save-subjects',
      },
    } as NarrativeAnalysis;

    expect(buildEndingWorldState(ledger, analysis)).toEqual({
      termination: 'resignation',
      defeatedSide: 'north',
      defeatedSealFate: 'destroyed',
      surrenderContext: analysis.surrenderContext,
      survivingFortresses: [
        {
          pieceId: 'b-r-a8',
          operatorName: 'Leoric',
          side: 'south',
          powerOutcome: 'retains-seal-power',
        },
      ],
    });
  });

  it('turns planned wounds into explicit prohibited, infliction, and active windows', () => {
    const ledger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
      ],
      events: Array.from({ length: 60 }, (_, index) => ({ ply: index + 1 })),
    } as GameLedger;
    const analysis = {
      woundPlans: [
        {
          pieceId: 'w-r-a1',
          inflictedAtPly: 55,
          injury: 'cracked ward plates',
          lastingEffects: ['exposed maintenance channels'],
          recoveryPly: null,
        },
      ],
    } as NarrativeAnalysis;
    const outline = {
      woundBeats: [
        {
          pieceId: 'w-r-a1',
          inflictedAtPly: 55,
          injury: 'cracked ward plates',
          continuityPlies: [55, 58],
          recoveryPly: null,
        },
      ],
    } as StoryOutline;

    expect(buildWoundTimeline(ledger, analysis, outline)).toEqual([
      {
        pieceId: 'w-r-a1',
        characterNames: ['Theron', 'Northeast Fortress'],
        injury: 'cracked ward plates',
        lastingEffects: ['exposed maintenance channels'],
        prohibitedBeforePly: 54,
        inflictedAtPly: 55,
        activeThroughPly: 60,
        recoveryPly: null,
      },
    ]);
  });

  it('includes rejected wound prose and temporal instructions in correction feedback', () => {
    const feedback = buildStoryCorrectionFeedback(
      'Generated story package contains wound timeline errors: Theron is wounded too early. Rejected prose: "His ward plates were cracked."',
    );

    expect(feedback).toContain('Rejected prose');
    expect(feedback).toContain('obey woundTimeline');
    expect(feedback).toContain('General danger may remain');
  });
});
