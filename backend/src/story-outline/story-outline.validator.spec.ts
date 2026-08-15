import { BadGatewayException } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from './models/story-outline';
import { StoryOutlineValidator } from './story-outline.validator';
import {
  normalizeStoryOutlineCharacters,
  normalizeStoryOutlineEndingSequence,
  normalizeStoryOutlineNumbering,
  normalizeStoryOutlineRelationshipScenes,
  normalizeStoryOutlineRequiredEvents,
  normalizeStoryOutlineSetupPayoffs,
  normalizeStoryOutlineStructure,
  normalizeStoryOutlineWounds,
} from './story-outline.service';

describe('StoryOutlineValidator', () => {
  const ledger = {
    events: [
      {
        ply: 1,
        isCapture: false,
        isCheck: false,
        isCastle: false,
        isPromotion: false,
        pieceId: 'w-q-d1',
      },
      {
        ply: 2,
        isCapture: true,
        isCheck: true,
        isCastle: false,
        isPromotion: false,
        pieceId: 'w-q-d1',
        capturedPieceId: 'b-p-f7',
      },
    ],
    pieces: [{ id: 'w-q-d1' }, { id: 'b-p-f7' }],
  } as GameLedger;
  const analysis = {
    acts: [{ startPly: 1, endPly: 2 }],
    woundPlans: [],
    relationshipPlans: [
      {
        id: 'queen-soldier-rivalry',
        characterIds: ['w-q-d1', 'b-p-f7'],
      },
      {
        id: 'queen-soldier-respect',
        characterIds: ['w-q-d1', 'b-p-f7'],
      },
    ],
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
            characters: ['w-q-d1', 'b-p-f7'],
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
    relationshipBeats: [
      {
        relationshipId: 'queen-soldier-rivalry',
        characterIds: ['w-q-d1', 'b-p-f7'],
        beatPlies: [1, 2],
        progression: 'The soldier recognizes the approaching Queen.',
        payoff: 'Their rivalry ends in the final confrontation.',
      },
      {
        relationshipId: 'queen-soldier-respect',
        characterIds: ['w-q-d1', 'b-p-f7'],
        beatPlies: [1, 2],
        progression: 'Defiance becomes reluctant respect.',
        payoff: 'The Queen acknowledges the soldier’s courage.',
      },
    ],
    selectedRevengePayoffs: [],
    woundBeats: [],
    endingSequence: [{ ply: 2, beat: 'The seal fails.' }],
    proseConstraints: ['Do not mention coordinates.'],
  };

  it('accepts a complete ledger-aligned outline', () => {
    expect(() =>
      new StoryOutlineValidator().validate(outline, ledger, analysis),
    ).not.toThrow();
  });

  it('rejects a revenge payoff that the ledger does not authorize', () => {
    const invalid = structuredClone(outline);
    invalid.selectedRevengePayoffs = [
      {
        avengerPieceId: 'w-q-d1',
        victimPieceId: 'w-q-d1',
        deathPly: 1,
        payoffPly: 2,
      },
    ];

    expect(() =>
      new StoryOutlineValidator().validate(invalid, ledger, analysis),
    ).toThrow('is not authorized by the ledger');
  });

  it('preserves a planned nonfatal wound in the outline', () => {
    const woundedAnalysis = structuredClone(analysis);
    woundedAnalysis.woundPlans = [
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 2,
        injury: 'Her left hand is severed.',
        lastingEffects: ['She can no longer wield a second weapon.'],
        recoveryPly: null,
      },
    ];
    const woundedOutline = structuredClone(outline);
    woundedOutline.woundBeats = [
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 2,
        injury: 'Her left hand is severed.',
        continuityPlies: [],
        recoveryPly: null,
      },
    ];

    expect(() =>
      new StoryOutlineValidator().validate(
        woundedOutline,
        ledger,
        woundedAnalysis,
      ),
    ).not.toThrow();
  });

  it('derives wound continuity from later actions instead of model plies', () => {
    const woundedAnalysis = structuredClone(analysis);
    woundedAnalysis.woundPlans = [
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 1,
        injury: 'Her left hand is severed.',
        lastingEffects: ['She can no longer wield a second weapon.'],
        recoveryPly: null,
      },
    ];
    const invalid = structuredClone(outline);
    invalid.woundBeats = [
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 1,
        injury: 'A different wound.',
        continuityPlies: [1, 99],
        recoveryPly: null,
      },
    ];

    const normalized = normalizeStoryOutlineWounds(
      invalid,
      ledger,
      woundedAnalysis,
    );

    expect(normalized.woundBeats).toEqual([
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 1,
        injury: 'Her left hand is severed.',
        continuityPlies: [2],
        recoveryPly: null,
      },
    ]);
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, woundedAnalysis),
    ).not.toThrow();
  });

  it('adds missing planned wounds and removes invented wounds', () => {
    const woundedAnalysis = structuredClone(analysis);
    woundedAnalysis.woundPlans = [
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 2,
        injury: 'Her left hand is severed.',
        lastingEffects: ['She can no longer wield a second weapon.'],
        recoveryPly: null,
      },
    ];
    const invalid = structuredClone(outline);
    invalid.woundBeats = [
      {
        pieceId: 'b-p-f7',
        inflictedAtPly: 1,
        injury: 'An invented injury.',
        continuityPlies: [2],
        recoveryPly: null,
      },
    ];

    expect(
      normalizeStoryOutlineWounds(invalid, ledger, woundedAnalysis).woundBeats,
    ).toEqual([
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 2,
        injury: 'Her left hand is severed.',
        continuityPlies: [],
        recoveryPly: null,
      },
    ]);
  });

  it('rejects an outline that drops a planned wound', () => {
    const woundedAnalysis = structuredClone(analysis);
    woundedAnalysis.woundPlans = [
      {
        pieceId: 'w-q-d1',
        inflictedAtPly: 2,
        injury: 'Her left hand is severed.',
        lastingEffects: ['She can no longer wield a second weapon.'],
        recoveryPly: null,
      },
    ];

    expect(() =>
      new StoryOutlineValidator().validate(outline, ledger, woundedAnalysis),
    ).toThrow('Planned wound w-q-d1:2 is missing');
  });

  it('repairs overlapping and gapped scene ranges from analysis boundaries', () => {
    const invalid = structuredClone(outline);
    invalid.acts[0].startPly = 2;
    invalid.acts[0].endPly = 99;
    invalid.acts[0].scenes[0].startPly = 2;
    invalid.acts[0].scenes[0].endPly = 2;
    invalid.acts[0].scenes[1].startPly = 2;
    invalid.acts[0].scenes[1].endPly = 99;

    const normalized = normalizeStoryOutlineStructure(invalid, analysis);

    expect(normalized.acts[0]).toMatchObject({
      startPly: 1,
      endPly: 2,
      scenes: [
        { startPly: 1, endPly: 1 },
        { startPly: 2, endPly: 2 },
      ],
    });
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('rebuilds a mismatched act count from analysis boundaries', () => {
    const twoActAnalysis = {
      ...structuredClone(analysis),
      acts: [
        {
          title: 'Approach',
          startPly: 1,
          endPly: 1,
          purpose: 'Establish the attack.',
        },
        {
          title: 'Fall',
          startPly: 2,
          endPly: 2,
          purpose: 'Resolve the attack.',
        },
      ],
    } as NarrativeAnalysis;
    const normalized = normalizeStoryOutlineStructure(
      structuredClone(outline),
      twoActAnalysis,
    );

    expect(normalized.acts).toMatchObject([
      {
        actNumber: 1,
        title: 'Approach',
        startPly: 1,
        endPly: 1,
        scenes: [{ startPly: 1, endPly: 1 }],
      },
      {
        actNumber: 2,
        title: 'Fall',
        startPly: 2,
        endPly: 2,
        scenes: [{ startPly: 2, endPly: 2 }],
      },
    ]);
  });

  it('rejects an outline that omits an analyzed relationship', () => {
    const invalid = structuredClone(outline);
    invalid.relationshipBeats = invalid.relationshipBeats.slice(0, 1);

    expect(() =>
      new StoryOutlineValidator().validate(invalid, ledger, analysis),
    ).toThrow('Relationship plan queen-soldier-respect is missing');
  });

  it('places both relationship characters in every planned scene', () => {
    const incomplete = structuredClone(outline);
    incomplete.acts[0].scenes[0].characters = ['w-q-d1'];

    const normalized = normalizeStoryOutlineRelationshipScenes(
      incomplete,
      analysis,
    );

    expect(normalized.acts[0].scenes[0].characters).toEqual([
      'w-q-d1',
      'b-p-f7',
    ]);
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('rejects an outline that omits a significant event', () => {
    const invalid = structuredClone(outline);
    invalid.acts[0].scenes[1].requiredEventPlies = [];

    expect(() =>
      new StoryOutlineValidator().validate(invalid, ledger, analysis),
    ).toThrow(BadGatewayException);
  });

  it('adds omitted significant events to their containing scenes', () => {
    const incomplete = structuredClone(outline);
    incomplete.acts[0].scenes[1].requiredEventPlies = [];

    const normalized = normalizeStoryOutlineRequiredEvents(incomplete, ledger);

    expect(normalized.acts[0].scenes[0].requiredEventPlies).toEqual([]);
    expect(normalized.acts[0].scenes[1].requiredEventPlies).toEqual([2]);
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('sorts and deduplicates required event plies', () => {
    const incomplete = structuredClone(outline);
    incomplete.acts[0].scenes[1].requiredEventPlies = [2, 2];

    const normalized = normalizeStoryOutlineRequiredEvents(incomplete, ledger);

    expect(normalized.acts[0].scenes[1].requiredEventPlies).toEqual([2]);
  });

  it('moves model-selected event plies into their containing scenes', () => {
    const misplaced = structuredClone(outline);
    misplaced.acts[0].scenes[0].requiredEventPlies = [2];
    misplaced.acts[0].scenes[1].requiredEventPlies = [];

    const normalized = normalizeStoryOutlineRequiredEvents(misplaced, ledger);

    expect(normalized.acts[0].scenes[0].requiredEventPlies).toEqual([]);
    expect(normalized.acts[0].scenes[1].requiredEventPlies).toEqual([2]);
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('discards required event plies that do not exist in the ledger', () => {
    const invalid = structuredClone(outline);
    invalid.acts[0].scenes[0].requiredEventPlies = [99];

    const normalized = normalizeStoryOutlineRequiredEvents(invalid, ledger);

    expect(normalized.acts[0].scenes[0].requiredEventPlies).toEqual([]);
    expect(normalized.acts[0].scenes[1].requiredEventPlies).toEqual([2]);
  });

  it('moves an ending payoff beyond the game back to the final ply', () => {
    const invalid = structuredClone(outline);
    invalid.setupPayoffs[0].payoffPly = 3;
    invalid.setupPayoffs[0].setupPlies = [1, 1];

    const normalized = normalizeStoryOutlineSetupPayoffs(invalid, ledger);

    expect(normalized.setupPayoffs[0]).toMatchObject({
      setupPlies: [1],
      payoffPly: 2,
    });
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('leaves an unrecoverable setup relationship invalid for targeted retry', () => {
    const invalid = structuredClone(outline);
    invalid.setupPayoffs[0].setupPlies = [2];
    invalid.setupPayoffs[0].payoffPly = 2;

    const normalized = normalizeStoryOutlineSetupPayoffs(invalid, ledger);

    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).toThrow('Invalid setup/payoff relationship gate');
  });

  it('moves the final planned ending beat to the ledger final ply', () => {
    const invalid = structuredClone(outline);
    invalid.endingSequence = [{ ply: 1, beat: 'The attack begins.' }];

    const normalized = normalizeStoryOutlineEndingSequence(invalid, ledger);

    expect(normalized.endingSequence).toEqual([
      { ply: 1, beat: 'The attack begins.' },
      { ply: 2, beat: 'The attack begins.' },
    ]);
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('removes unknown character IDs and retains valid supporting characters', () => {
    const invalid = structuredClone(outline);
    invalid.acts[0].scenes[0].characters = ['w-q-d1', 'b-p-f2'];

    const normalized = normalizeStoryOutlineCharacters(invalid, ledger);

    expect(normalized.acts[0].scenes[0].characters).toEqual(['w-q-d1']);
  });

  it('adds moving and captured pieces to their containing scenes', () => {
    const incomplete = structuredClone(outline);
    incomplete.acts[0].scenes[1].characters = [];

    const normalized = normalizeStoryOutlineCharacters(incomplete, ledger);

    expect(normalized.acts[0].scenes[1].characters).toEqual([
      'w-q-d1',
      'b-p-f7',
    ]);
    expect(() =>
      new StoryOutlineValidator().validate(normalized, ledger, analysis),
    ).not.toThrow();
  });

  it('allows scene numbering to restart in each act', () => {
    const twoActAnalysis = {
      acts: [
        { startPly: 1, endPly: 1 },
        { startPly: 2, endPly: 2 },
      ],
      relationshipPlans: analysis.relationshipPlans,
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

  it('normalizes model-provided act and scene numbers', () => {
    const unnormalized = structuredClone(outline);
    unnormalized.acts[0].actNumber = 8;
    unnormalized.acts[0].scenes[0].sceneNumber = 12;

    const normalized = normalizeStoryOutlineNumbering(unnormalized);

    expect(normalized.acts[0].actNumber).toBe(1);
    expect(normalized.acts[0].scenes[0].sceneNumber).toBe(1);
  });
});
