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

  it('rejects revealing an Ascension Seal before its activation', () => {
    const promotionLedger = {
      events: [
        { ply: 1, isPromotion: false },
        { ply: 2, isPromotion: false },
        { ply: 3, isPromotion: true },
      ],
    } as GameLedger;

    const findings = validator.validatePrematureAscensionReveals(
      [
        {
          ply: 1,
          fantasyNarration:
            'She found a prototype Ascension Seal beneath the altar.',
        },
        {
          ply: 3,
          fantasyNarration:
            'At her touch, the relic revealed itself as an Ascension Seal.',
        },
      ],
      promotionLedger,
    );

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      type: 'premature-promotion-reveal',
      ply: 1,
    });
  });

  it('allows an unidentified relic before promotion', () => {
    const promotionLedger = {
      events: [
        { ply: 1, isPromotion: false },
        { ply: 2, isPromotion: true },
      ],
    } as GameLedger;

    expect(
      validator.validatePrematureAscensionReveals(
        [
          {
            ply: 1,
            fantasyNarration:
              'An unidentified relic pulsed beneath the forgotten altar.',
          },
        ],
        promotionLedger,
      ),
    ).toEqual([]);
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
        severity: 'warning',
        ply: 14,
        pieceId: 'b-q-d8',
        message:
          "Southern Queen's wound is inflicted at ply 16 but appears prematurely at ply 14",
      }),
    ]);
  });

  it('rejects structured wound references with the wrong owner or timing', () => {
    const wounds = [
      {
        pieceId: 'b-n-b8',
        inflictedAtPly: 20,
        injury: 'fractured forearm',
        lastingEffects: ['weak grip'],
        recoveryPly: null,
      },
    ];

    const findings = validator.validateStructuredWoundReferences(
      [
        {
          ply: 19,
          characters: ['b-n-g8'],
          woundReferences: [
            {
              woundId: 'wound:b-n-b8:20',
              ownerPieceId: 'b-n-g8',
            },
          ],
        },
        {
          ply: 20,
          characters: ['b-n-b8'],
          woundReferences: [],
        },
      ],
      wounds,
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'error', ply: 19 }),
        expect.objectContaining({
          severity: 'error',
          ply: 20,
          type: 'missing-wound',
        }),
      ]),
    );
  });

  it('accepts a wound reference owned by the active character', () => {
    expect(
      validator.validateStructuredWoundReferences(
        [
          {
            ply: 20,
            characters: ['b-n-b8'],
            woundReferences: [
              {
                woundId: 'wound:b-n-b8:20',
                ownerPieceId: 'b-n-b8',
              },
            ],
          },
        ],
        [
          {
            pieceId: 'b-n-b8',
            inflictedAtPly: 20,
            injury: 'fractured forearm',
            lastingEffects: ['weak grip'],
            recoveryPly: null,
          },
        ],
      ),
    ).toEqual([]);
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
        message:
          'Cedric must kill Dain at ply 11, but the prose reverses the captor and victim',
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

  it('does not mistake the victim striking first for winning the capture', () => {
    const captureLedger = {
      pieces: [
        { id: 'w-p-b2', permanentName: 'Aric', viewpointName: 'Aric' },
        { id: 'b-p-a7', permanentName: 'Tarin', viewpointName: 'Tarin' },
      ],
      events: [
        {
          ply: 63,
          isCapture: true,
          pieceId: 'w-p-b2',
          capturedPieceId: 'b-p-a7',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 63,
            fantasyNarration:
              'Tarin struck first but could not stop Aric’s counterattack;',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);
  });

  it('rejects explicit direct, passive, and possessive-weapon reversals', () => {
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
    const reversed = [
      'Dain killed Cedric beneath the broken gate.',
      'Cedric was crushed beneath the gate by Dain.',
      'Dain’s spear pierced Cedric’s heart.',
    ];

    reversed.forEach((fantasyNarration) => {
      expect(
        validator.validateCaptureAttribution(
          [{ ply: 11, fantasyNarration }],
          captureLedger,
        ),
      ).toEqual([expect.objectContaining({ type: 'wrong-captor' })]);
    });
  });

  it('does not hard-fail ambiguous observation language', () => {
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
              'Dain watched the outer wall crushed around Cedric as the banners vanished in smoke.',
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

  it('does not reverse a Fortress capture when the victim is described before the operator', () => {
    const captureLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
        {
          id: 'b-r-a8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
        },
      ],
      events: [
        {
          ply: 55,
          isCapture: true,
          pieceId: 'w-r-a1',
          capturedPieceId: 'b-r-a8',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 55,
            fantasyNarration:
              'Roderic, unable to turn cleanly and crushed by his failing restraints, kept his guns trained northward until Theron’s directed ram and point-blank cannon fire split the engine open; steam, sparks, and water filled Roderic’s cradle and killed him.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);
  });

  it('does not give a capture to a victim who could not respond before the actor attacked', () => {
    const captureLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
        },
      ],
      events: [
        {
          ply: 55,
          isCapture: true,
          pieceId: 'w-r-a1',
          capturedPieceId: 'b-r-h8',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 55,
            fantasyNarration:
              'Theron drove the Northeast Fortress into the Southwest Fortress before Roderic could realign his crippled engine, accepting the collision that tore away Theron’s outer wheel housing and cracked his lateral ward plates.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);
  });

  it('does not give a capture to a victim merely trying to defend', () => {
    const captureLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
        },
        {
          id: 'b-b-c8',
          permanentName: 'Southwest Archwizard',
        },
      ],
      events: [
        {
          ply: 75,
          isCapture: true,
          pieceId: 'w-r-a1',
          capturedPieceId: 'b-b-c8',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 75,
            fantasyNarration:
              'Theron saw the wounded Southwest Archwizard trying to shape a defense with one ruined arm and drove the Northeast Fortress over the shattered bridge toward him.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);
  });

  it('does not reverse a capture when the real killer appears before the decisive verb', () => {
    const captureLedger = {
      pieces: [
        { id: 'w-p-e2', permanentName: 'Merek', viewpointName: 'Merek' },
        {
          id: 'b-r-a8',
          permanentName: 'Northwest Fortress',
          operatorName: 'Edric',
        },
      ],
      events: [
        {
          ply: 90,
          isCapture: true,
          pieceId: 'w-p-e2',
          capturedPieceId: 'b-r-a8',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 90,
            fantasyNarration:
              'Edric felt his cradle rupture and the life-support pressure vanish as Merek’s guns tore the hull open; he died trapped within the collapsing engine while Merek whispered, “Forgive me,” into the iron dark.',
          },
        ],
        captureLedger,
      ),
    ).toEqual([]);

    expect(
      validator.validateCaptureAttribution(
        [
          {
            ply: 90,
            fantasyNarration:
              'Inside his own cradle, Edric felt the hull split and life-support pressure fail; he tried to redirect a gun toward Merek, but the promoted fortress’s ram crushed the command section before he could finish the order.',
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

  it('does not attribute environmental damage to a future Fortress wound', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
          fantasyType: 'moving-fortress',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedWounds(
        [
          {
            ply: 54,
            characters: ['w-r-a1'],
            woundsInflicted: [],
            fantasyNarration:
              'Roderic aimed past the shattered bridge and fired the fortress’s heavy magical impact into the Northern Queen as she accelerated toward Theron’s distant signal.',
          },
          {
            ply: 55,
            characters: ['w-r-a1'],
            woundsInflicted: [{ pieceId: 'w-r-a1', inflictedAtPly: 55 }],
            fantasyNarration:
              'The collision severed the Northeast Fortress’s outer wheel housing and cracked its lateral ward plates.',
          },
        ],
        [
          {
            pieceId: 'w-r-a1',
            inflictedAtPly: 55,
            injury:
              'severed outer wheel housing and cracked lateral ward plates',
            lastingEffects: [
              'exposure of vulnerable maintenance channels',
              'increased risk of command-cradle shock',
            ],
            recoveryPly: null,
          },
        ],
        woundLedger,
      ),
    ).toEqual([]);
  });

  it('does not carry a wound pronoun onto a different explicitly named pilot', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
          fantasyType: 'moving-fortress',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedWounds(
        [
          {
            ply: 54,
            characters: ['w-r-a1', 'b-r-h8'],
            woundsInflicted: [],
            fantasyNarration:
              'Theron answered the distant signal. The recoil fractured Roderic’s ribs within his cradle and broke armor around him, yet he held the guns on the Northern route.',
          },
          {
            ply: 55,
            characters: ['w-r-a1'],
            woundsInflicted: [{ pieceId: 'w-r-a1', inflictedAtPly: 55 }],
            fantasyNarration:
              'The collision severed the Northeast Fortress’s outer wheel housing and cracked its lateral ward plates.',
          },
        ],
        [
          {
            pieceId: 'w-r-a1',
            inflictedAtPly: 55,
            injury:
              'severed outer wheel housing and cracked lateral ward plates',
            lastingEffects: ['increased risk of command-cradle shock'],
            recoveryPly: null,
          },
        ],
        woundLedger,
      ),
    ).toEqual([]);
  });

  it('attributes damage to the nearest named pilot when another pilot witnesses it', () => {
    const woundLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Theron',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
          fantasyType: 'moving-fortress',
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedWounds(
        [
          {
            ply: 54,
            characters: ['w-r-a1', 'b-r-h8'],
            woundsInflicted: [],
            fantasyNarration:
              "The answering magical recoil broke the engine's frontal plating and battered Roderic’s ribs inside the cradle, leaving him gasping beneath fractured restraint metal while Theron witnessed the Queen’s death.",
          },
          {
            ply: 55,
            characters: ['w-r-a1'],
            woundsInflicted: [{ pieceId: 'w-r-a1', inflictedAtPly: 55 }],
            fantasyNarration:
              'The collision severed the Northeast Fortress’s outer wheel housing and cracked its lateral ward plates.',
          },
        ],
        [
          {
            pieceId: 'w-r-a1',
            inflictedAtPly: 55,
            injury:
              'severed outer wheel housing and cracked lateral ward plates',
            lastingEffects: [
              'exposure of vulnerable maintenance channels',
              'increased risk of command-cradle shock',
            ],
            recoveryPly: null,
          },
        ],
        woundLedger,
      ),
    ).toEqual([]);
  });

  it('requires a verified revenge capture to name the witnessed victim', () => {
    const revengeLedger = {
      pieces: [
        { id: 'w-n-b1', permanentName: 'Bram' },
        { id: 'b-q-d8', permanentName: 'Sera' },
        { id: 'w-q-d1', permanentName: 'Jessamine' },
      ],
      events: [
        { ply: 1 },
        {
          ply: 2,
          pieceId: 'w-n-b1',
          capturedPieceId: 'b-q-d8',
          interactionContext: {
            adjacentAllyPieceIds: [],
            avengesDeaths: [{ victimPieceId: 'w-q-d1', deathPly: 1 }],
          },
        },
      ],
    } as GameLedger;

    expect(
      validator.validateRevengePayoffs(
        [
          {
            ply: 2,
            fantasyNarration: 'Bram drove his poleaxe through Sera’s chest.',
          },
        ],
        revengeLedger,
        [
          {
            deathPly: 1,
            payoffPly: 2,
          },
        ],
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'missing-revenge-payoff',
        ply: 2,
        pieceId: 'w-n-b1',
        message: expect.stringContaining('Jessamine'),
      }),
    ]);
    expect(
      validator.validateRevengePayoffs(
        [
          {
            ply: 2,
            fantasyNarration:
              'Bram remembered Jessamine falling and drove his poleaxe through Sera’s chest.',
          },
        ],
        revengeLedger,
        [
          {
            deathPly: 1,
            payoffPly: 2,
          },
        ],
      ),
    ).toEqual([]);
  });

  it('does not require an unselected eligible revenge opportunity', () => {
    const revengeLedger = {
      pieces: [
        { id: 'w-n-b1', permanentName: 'Bram' },
        { id: 'b-q-d8', permanentName: 'Sera' },
        { id: 'w-q-d1', permanentName: 'Jessamine' },
      ],
      events: [
        { ply: 1 },
        {
          ply: 2,
          pieceId: 'w-n-b1',
          capturedPieceId: 'b-q-d8',
          interactionContext: {
            adjacentAllyPieceIds: [],
            avengesDeaths: [{ victimPieceId: 'w-q-d1', deathPly: 1 }],
          },
        },
      ],
    } as GameLedger;

    expect(
      validator.validateRevengePayoffs(
        [{ ply: 2, fantasyNarration: 'Bram defeated Sera.' }],
        revengeLedger,
        [],
      ),
    ).toEqual([]);
  });

  it('detects bodily injury assigned to a character without an active wound', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'w-b-f1',
          permanentName: 'Ansel',
          fantasyType: 'archwizard',
        },
      ],
      events: [{ ply: 1, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 1,
            characters: ['w-b-f1'],
            fantasyNarration:
              'Ansel walked with breath short from the damage beneath his ribs.',
          },
        ],
        [],
        injuryLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'warning',
        pieceId: 'w-b-f1',
      }),
    ]);
  });

  it('warns when a named character inherits another character’s distinctive wounds', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-b-c8',
          permanentName: 'Archwizard Mara',
          characterName: 'Mara',
          fantasyType: 'archwizard',
        },
        {
          id: 'b-b-f8',
          permanentName: 'Archwizard Sabine',
          characterName: 'Sabine',
          fantasyType: 'archwizard',
        },
        {
          id: 'b-q-d8',
          permanentName: 'Queen Kerra',
          characterName: 'Kerra',
          fantasyType: 'queen',
        },
      ],
      events: [{ ply: 40, isCapture: false }],
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-b-f8',
        inflictedAtPly: 12,
        injury: 'deep magical laceration across the casting forearm',
        lastingEffects: ['persistent spell tremor'],
        recoveryPly: null,
      },
      {
        pieceId: 'b-b-f8',
        inflictedAtPly: 28,
        injury: 'crushed ankle and heat-burned lower leg',
        lastingEffects: ['impaired walking'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 40,
            characters: ['b-b-c8', 'b-q-d8'],
            fantasyNarration:
              "Archwizard Mara walked unevenly through the smoke, her injured forearm shaking and her ruined leg dragging over broken paving, Kerra's insignia in her other hand.",
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'warning',
        pieceId: 'b-b-c8',
      }),
    ]);
  });

  it('does not guess wound ownership when another wounded character owns the prose', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-b-c8',
          permanentName: 'Archwizard Mara',
          characterName: 'Mara',
          fantasyType: 'archwizard',
        },
        {
          id: 'b-b-f8',
          permanentName: 'Archwizard Sabine',
          characterName: 'Sabine',
          fantasyType: 'archwizard',
        },
      ],
      events: [{ ply: 40, isCapture: false }],
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-b-f8',
        inflictedAtPly: 12,
        injury: 'deep laceration across the forearm and shoulder',
        lastingEffects: ['persistent pain'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 40,
            characters: ['b-b-c8', 'b-b-f8'],
            fantasyNarration:
              'Mara reached Sabine, whose lacerated forearm and injured shoulder shook with pain.',
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([]);
  });

  it('allows active planned wounds, fatal capture wounds, and royal check strain', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'w-b-f1',
          permanentName: 'Ansel',
          fantasyType: 'archwizard',
        },
        {
          id: 'w-k-e1',
          permanentName: 'King Garrick',
          fantasyType: 'king',
        },
        {
          id: 'b-p-a7',
          permanentName: 'Mirelle',
          fantasyType: 'grunt',
        },
      ],
      events: [
        { ply: 1, isCapture: false },
        { ply: 2, isCapture: false },
        { ply: 3, isCapture: true, capturedPieceId: 'b-p-a7' },
      ],
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'w-b-f1',
        inflictedAtPly: 1,
        injury: 'fractured ribs',
        lastingEffects: ['shortened breath'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 1,
            characters: ['w-b-f1'],
            fantasyNarration: 'Ansel clutched his fractured ribs.',
          },
          {
            ply: 2,
            characters: ['w-k-e1'],
            fantasyNarration:
              'King Garrick staggered as pain burned through his chest.',
          },
          {
            ply: 3,
            characters: ['b-p-a7'],
            fantasyNarration:
              'Mirelle died when the blade pierced her wounded chest.',
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([]);
  });
});
