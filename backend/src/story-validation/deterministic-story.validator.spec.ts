import type { GameLedger } from '../chess/models/game-ledger';
import { DeterministicStoryValidator } from './deterministic-story.validator';

describe('DeterministicStoryValidator', () => {
  const ledger = {
    pieces: [{ id: 'w-q-d1' }],
  } as GameLedger;
  const validator = new DeterministicStoryValidator();

  it('detects coordinates, chess-derived file names, and piece IDs', () => {
    const findings = validator.validate(
      'The w-q-d1 led the E-file Company toward f7.',
      ledger,
    );

    expect(findings.map((finding) => finding.type)).toEqual(
      expect.arrayContaining([
        'coordinate-mentioned-in-prose',
        'chess-terminology',
        'inconsistent-piece-name',
      ]),
    );
  });

  it('accepts fantasy-native prose', () => {
    expect(
      validator.validate(
        'The Northern Queen led the Ember Company toward the royal ward.',
        ledger,
      ),
    ).toEqual([]);
  });

  it('repairs prohibited chess terminology deterministically', () => {
    const repaired = validator.repairProhibitedTerminology(
      'The E-file Company recorded checkmate after three plies of chess.',
    );

    expect(repaired).toBe(
      'The battlefront Company recorded final defeat after three turns of war.',
    );
    expect(validator.validate(repaired, ledger)).toEqual([]);
  });

  it('detects a character described as dead before their capture', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'b-p-d7',
          permanentName: 'Nessa',
          viewpointName: 'Nessa',
          capturedAtPly: 40,
        },
      ],
    } as GameLedger;

    const findings = validator.validateTimedCharacterFates(
      [
        {
          ply: 26,
          fantasyNarration:
            "The dead Nessa's distant standard weighed on his eyes.",
        },
      ],
      fateLedger,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'invented-capture',
        ply: 26,
        pieceId: 'b-p-d7',
        excerpt: "dead Nessa's",
      }),
    ]);
  });

  it('allows death language at or after the ledger capture', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'b-p-d7',
          permanentName: 'Nessa',
          capturedAtPly: 40,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [{ ply: 40, fantasyNarration: "Nessa's death broke the company." }],
        fateLedger,
      ),
    ).toEqual([]);
  });

  it('detects death claims about ledger survivors', () => {
    const fateLedger = {
      pieces: [{ id: 'b-p-d7', permanentName: 'Nessa' }],
    } as GameLedger;

    const findings = validator.validateTimedCharacterFates(
      [{ ply: 26, fantasyNarration: 'The corpse of Nessa was carried home.' }],
      fateLedger,
    );

    expect(findings[0]).toMatchObject({
      type: 'survivor-killed',
      ply: 26,
      pieceId: 'b-p-d7',
    });
  });

  it('protects a surviving Moving Fortress operator from invented death', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northwest Fortress',
          operatorName: 'Torren',
        },
      ],
    } as GameLedger;

    const findings = validator.validateTimedCharacterFates(
      [{ ply: 12, fantasyNarration: 'The corpse of Torren lay within.' }],
      fateLedger,
    );

    expect(findings[0]).toMatchObject({
      type: 'survivor-killed',
      pieceId: 'w-r-a1',
      excerpt: 'corpse of Torren',
    });
  });

  it('rejects a planned wound mentioned before its infliction beat', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Southern Queen',
          fantasyType: 'queen',
        },
      ],
    } as GameLedger;

    const findings = validator.validateTimedWounds(
      [
        {
          ply: 14,
          characters: ['b-q-d8'],
          woundsInflicted: [],
          fantasyNarration:
            'The Southern Queen crossed the slope. She held one hand over the narrow wound low in her abdomen and hid the pain.',
        },
        {
          ply: 16,
          characters: ['b-q-d8'],
          woundsInflicted: [{ pieceId: 'b-q-d8', inflictedAtPly: 16 }],
          fantasyNarration:
            'A magical counterstrike punctured the Southern Queen through the lower abdomen.',
        },
      ],
      [
        {
          pieceId: 'b-q-d8',
          inflictedAtPly: 16,
          injury:
            'A narrow puncture through the lower abdomen caused by a magical counterstrike.',
          lastingEffects: ['Persistent abdominal pain'],
          recoveryPly: null,
        },
      ],
      woundLedger,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'wound-continuity',
        ply: 14,
        pieceId: 'b-q-d8',
        message: expect.stringContaining(
          'inflicted at ply 16 but appears prematurely at ply 14',
        ),
      }),
    ]);
  });

  it('rejects generic damage and pain language before the planned wound', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Southern Queen',
          fantasyType: 'queen',
        },
      ],
    } as GameLedger;

    const findings = validator.validateTimedWounds(
      [
        {
          ply: 14,
          characters: ['b-q-d8'],
          woundsInflicted: [],
          fantasyNarration:
            'The Southern Queen crossed the ruins at impossible speed. Her damaged left shoulder struck against its harness, and she hid the pain behind a smile.',
        },
        {
          ply: 16,
          characters: ['b-q-d8'],
          woundsInflicted: [{ pieceId: 'b-q-d8', inflictedAtPly: 16 }],
          fantasyNarration:
            'The counterstrike crushed the Southern Queen’s left shoulder against her harness.',
        },
      ],
      [
        {
          pieceId: 'b-q-d8',
          inflictedAtPly: 16,
          injury: 'Blunt-force trauma to the left shoulder and collarbone.',
          lastingEffects: [
            'Pain when wielding a heavy weapon',
            'Damaged armor harness limiting rapid movement',
          ],
          recoveryPly: null,
        },
      ],
      woundLedger,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'wound-continuity',
        ply: 14,
        pieceId: 'b-q-d8',
      }),
    ]);
  });

  it('rejects prose that reverses the ledger captor and victim', () => {
    const captureLedger = {
      pieces: [
        {
          id: 'w-p-e2',
          permanentName: 'Cedric',
          viewpointName: 'Cedric',
        },
        {
          id: 'b-p-e7',
          permanentName: 'Dain',
          viewpointName: 'Dain',
        },
      ],
      events: [
        {
          ply: 11,
          isCapture: true,
          pieceId: 'w-p-e2',
          capturedPieceId: 'b-p-e7',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 11,
            fantasyNarration:
              'Cedric lunged to kill Dain, but Dain caught the blade and drove his spear through Cedric’s mouth and skull.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'wrong-captor',
        ply: 11,
        pieceId: 'w-p-e2',
        message: expect.stringContaining(
          "Dain is incorrectly given Cedric's capture",
        ),
      }),
    ]);
  });

  it('accepts prose that gives the capture to the ledger actor', () => {
    const captureLedger = {
      pieces: [
        { id: 'w-p-e2', permanentName: 'Cedric', viewpointName: 'Cedric' },
        { id: 'b-p-e7', permanentName: 'Dain', viewpointName: 'Dain' },
      ],
      events: [
        {
          ply: 11,
          isCapture: true,
          pieceId: 'w-p-e2',
          capturedPieceId: 'b-p-e7',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 11,
            fantasyNarration:
              'Dain raised his shield, but Cedric drove his spear through Dain’s throat.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);
  });

  it('does not treat a possessive victim reference as the killer', () => {
    const captureLedger = {
      pieces: [
        { id: 'b-p-e7', permanentName: 'Dain', viewpointName: 'Dain' },
        {
          id: 'w-b-f1',
          permanentName: 'Northeast Archwizard',
        },
      ],
      events: [
        {
          ply: 8,
          isCapture: true,
          pieceId: 'b-p-e7',
          capturedPieceId: 'w-b-f1',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 8,
            fantasyNarration:
              'Dain caught the Northeast Archwizard’s warding wrist and buried a spear beneath the mage’s ribs as dying light burned Dain’s arm.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);
  });

  it('treats a character’s last breath as a premature death', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'w-p-e2',
          permanentName: 'Cedric',
          capturedAtPly: 12,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [
          {
            ply: 11,
            fantasyNarration:
              'Cedric’s last breath was a wet attempt to call his company back.',
          },
        ],
        fateLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-capture',
        ply: 11,
        pieceId: 'w-p-e2',
      }),
    ]);
  });

  it('requires the infliction scene to portray the planned wound', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Southern Queen',
          fantasyType: 'queen',
        },
      ],
    } as GameLedger;

    const findings = validator.validateTimedWounds(
      [
        {
          ply: 16,
          characters: ['b-q-d8'],
          woundsInflicted: [],
          fantasyNarration:
            'The Southern Queen swept through the company and continued onward.',
        },
      ],
      [
        {
          pieceId: 'b-q-d8',
          inflictedAtPly: 16,
          injury: 'A puncture through the lower abdomen.',
          lastingEffects: ['Persistent abdominal pain'],
          recoveryPly: null,
        },
      ],
      woundLedger,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'missing-wound',
        ply: 16,
        pieceId: 'b-q-d8',
      }),
    ]);
  });

  it('accepts a wound introduced at its exact infliction beat', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Southern Queen',
          fantasyType: 'queen',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedWounds(
        [
          {
            ply: 14,
            characters: ['b-q-d8'],
            woundsInflicted: [],
            fantasyNarration:
              'The Southern Queen crossed the slope without slowing.',
          },
          {
            ply: 16,
            characters: ['b-q-d8'],
            woundsInflicted: [{ pieceId: 'b-q-d8', inflictedAtPly: 16 }],
            fantasyNarration:
              'A magical counterstrike punctured the Southern Queen through the lower abdomen.',
          },
        ],
        [
          {
            pieceId: 'b-q-d8',
            inflictedAtPly: 16,
            injury: 'A puncture through the lower abdomen.',
            lastingEffects: ['Persistent abdominal pain'],
            recoveryPly: null,
          },
        ],
        woundLedger,
      ),
    ).toEqual([]);
  });
});
