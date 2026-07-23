import { BadGatewayException } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from './models/story-outline';
import { StoryOutlineValidator } from './story-outline.validator';

describe('StoryOutlineValidator', () => {
  const ledger = {
    events: [
      {
        ply: 1,
        isCapture: false,
        isCheck: false,
        isCastle: false,
        isPromotion: false,
      },
      {
        ply: 2,
        isCapture: true,
        isCheck: true,
        isCastle: false,
        isPromotion: false,
      },
    ],
    pieces: [{ id: 'w-q-d1' }, { id: 'b-p-f7' }],
  } as GameLedger;
  const analysis = {
    acts: [{ startPly: 1, endPly: 2 }],
  } as NarrativeAnalysis;
  const outline: StoryOutline = {
    selectedTitle: 'The Last Gate',
    theme: 'A prepared strike defeats false security.',
    acts: [
      {
        actNumber: 1,
        title: 'The Last Gate',
        startPly: 1,
        endPly: 2,
        purpose: 'Set up and resolve the attack.',
        scenes: [
          {
            sceneNumber: 1,
            title: 'The Approach',
            startPly: 1,
            endPly: 1,
            purpose: 'Establish the attacker.',
            emotionalBeat: 'dread',
            characters: ['w-q-d1'],
            requiredEventPlies: [],
            continuityNotes: ['No deaths occur.'],
          },
          {
            sceneNumber: 2,
            title: 'The Fall',
            startPly: 2,
            endPly: 2,
            purpose: 'Resolve the capture and check.',
            emotionalBeat: 'collapse',
            characters: ['w-q-d1', 'b-p-f7'],
            requiredEventPlies: [2],
            continuityNotes: ['Only b-p-f7 dies.'],
          },
        ],
      },
    ],
    setupPayoffs: [
      {
        id: 'gate',
        setupPlies: [1],
        payoffPly: 2,
        setup: 'The gate is exposed.',
        payoff: 'The queen breaks through.',
      },
    ],
    endingSequence: [{ ply: 2, beat: 'The seal fails.' }],
    proseConstraints: ['Do not mention coordinates.'],
  };

  it('accepts a complete ledger-aligned outline', () => {
    expect(() =>
      new StoryOutlineValidator().validate(outline, ledger, analysis),
    ).not.toThrow();
  });

  it('rejects an outline that omits a significant event', () => {
    const invalid = structuredClone(outline);
    invalid.acts[0].scenes[1].requiredEventPlies = [];

    expect(() =>
      new StoryOutlineValidator().validate(invalid, ledger, analysis),
    ).toThrow(BadGatewayException);
  });

  it('allows scene numbering to restart in each act', () => {
    const twoActAnalysis = {
      acts: [
        { startPly: 1, endPly: 1 },
        { startPly: 2, endPly: 2 },
      ],
    } as NarrativeAnalysis;
    const twoActOutline = structuredClone(outline);
    const [approach, fall] = twoActOutline.acts[0].scenes;
    twoActOutline.acts = [
      {
        ...twoActOutline.acts[0],
        endPly: 1,
        scenes: [approach],
      },
      {
        ...twoActOutline.acts[0],
        actNumber: 2,
        title: 'The Fall',
        startPly: 2,
        endPly: 2,
        scenes: [{ ...fall, sceneNumber: 1 }],
      },
    ];

    expect(() =>
      new StoryOutlineValidator().validate(
        twoActOutline,
        ledger,
        twoActAnalysis,
      ),
    ).not.toThrow();
  });
});
