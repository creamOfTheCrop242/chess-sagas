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

  it('attributes leaked coordinates to their exact scene for targeted repair', () => {
    expect(
      validator.validateSceneTerminology([
        {
          ply: 76,
          fantasyNarration: 'The Queen closed the lower passage.',
        },
        {
          ply: 77,
          fantasyNarration:
            'The Queen controlled g8, h8, and g7 around the King.',
        },
      ]),
    ).toEqual([
      expect.objectContaining({
        type: 'coordinate-mentioned-in-prose',
        ply: 77,
        excerpt: 'g8',
      }),
    ]);
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

  it('does not mistake a survivable crushed-limb wound for a premature death', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'b-n-b8',
          permanentName: 'Southeast Knight Commander',
          characterName: 'Godric',
          pronouns: 'he/him',
          capturedAtPly: 33,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [
          {
            ply: 22,
            fantasyNarration:
              "The collapsing hull crushed Godric's lower leg and fractured his hip, but he remained alive and fought on.",
          },
        ],
        fateLedger,
      ),
    ).toEqual([]);
  });

  it('still rejects an explicit premature killing', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'b-n-b8',
          permanentName: 'Southeast Knight Commander',
          characterName: 'Godric',
          capturedAtPly: 33,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [
          {
            ply: 22,
            fantasyNarration:
              'The collapsing hull killed Godric before the fighting moved on.',
          },
        ],
        fateLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-capture',
        ply: 22,
        pieceId: 'b-n-b8',
        excerpt: 'killed Godric',
      }),
    ]);
  });

  it('rejects a second death in a scene by resolving an unambiguous pronoun', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'w-p-a2',
          permanentName: 'Mara',
          pronouns: 'she/her',
          capturedAtPly: 65,
        },
        {
          id: 'w-p-b2',
          permanentName: 'Tarin',
          pronouns: 'he/him',
          capturedAtPly: 69,
        },
        {
          id: 'b-n-b8',
          permanentName: 'Nerys',
          pronouns: 'she/her',
        },
      ],
    } as GameLedger;

    const findings = validator.validateTimedCharacterFates(
      [
        {
          ply: 65,
          fantasyNarration:
            'Nerys struck Mara down. Tarin rushed forward to protect her retreat, and Nerys killed him with a second sweep.',
        },
      ],
      fateLedger,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'invented-capture',
        ply: 65,
        pieceId: 'w-p-b2',
        excerpt:
          'Tarin rushed forward to protect her retreat, and Nerys killed him with a second sweep.',
      }),
    ]);
  });

  it('does not resolve an ambiguous death pronoun', () => {
    const fateLedger = {
      pieces: [
        {
          id: 'w-p-a2',
          permanentName: 'Tarin',
          pronouns: 'he/him',
          capturedAtPly: 69,
        },
        {
          id: 'w-p-b2',
          permanentName: 'Cedric',
          pronouns: 'he/him',
          capturedAtPly: 71,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [
          {
            ply: 65,
            fantasyNarration:
              'Tarin warned Cedric before the enemy commander killed him.',
          },
        ],
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

  it('allows the defeated King to die at the exact checkmate ply', () => {
    const fateLedger = {
      metadata: { termination: 'checkmate' },
      pieces: [
        {
          id: 'w-k-e1',
          permanentName: 'Northern King',
          characterName: 'Gareth',
        },
      ],
      events: [
        {
          ply: 122,
          isCheckmate: true,
          checkmateExplanation: { kingId: 'w-k-e1' },
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [
          {
            ply: 122,
            fantasyNarration:
              "Aldren's reinforced prow crushed Gareth against the basin wall and killed him.",
          },
        ],
        fateLedger,
      ),
    ).toEqual([]);
  });

  it('still rejects the defeated King dying before the checkmate ply', () => {
    const fateLedger = {
      metadata: { termination: 'checkmate' },
      pieces: [
        {
          id: 'w-k-e1',
          permanentName: 'Northern King',
          characterName: 'Gareth',
        },
      ],
      events: [
        {
          ply: 122,
          isCheckmate: true,
          checkmateExplanation: { kingId: 'w-k-e1' },
        },
      ],
    } as GameLedger;

    expect(
      validator.validateTimedCharacterFates(
        [
          {
            ply: 121,
            fantasyNarration:
              'Gareth was killed before Aldren reached the basin.',
          },
        ],
        fateLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'survivor-killed',
        ply: 121,
        pieceId: 'w-k-e1',
      }),
    ]);
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

  it("warns when a commander's wound scene uses another Mythic Arm", () => {
    const commander = {
      id: 'b-n-g8',
      permanentName: 'Knight Commander Brienne',
      characterName: 'Brienne',
      fantasyType: 'knight-commander',
      originalSquare: 'g8',
      mythicArm: {
        id: 'stormbound-great-hammer',
        name: 'stormbound great hammer',
        description:
          'a stormbound great hammer whose impacts release concussive thunder',
      },
    } as GameLedger['pieces'][number];
    const woundLedger = {
      initialFen: 'test-seed',
      pieces: [commander],
    } as GameLedger;
    const findings = validator.validateTimedWounds(
      [
        {
          ply: 12,
          characters: [commander.id],
          woundsInflicted: [{ pieceId: commander.id, inflictedAtPly: 12 }],
          fantasyNarration:
            'Brienne forced a realm-light strike through the hammer, but the effort tore her shoulder and left her with limited overhead sword movement.',
        },
      ],
      [
        {
          pieceId: commander.id,
          inflictedAtPly: 12,
          injury: 'A damaged right forearm',
          lastingEffects: ['Painful weapon use'],
          recoveryPly: null,
        },
      ],
      woundLedger,
    );

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'mythic-arm-ownership',
          severity: 'warning',
          pieceId: commander.id,
          ply: 12,
        }),
      ]),
    );
  });

  it("rejects another commander's Mythic Arm in a death scene", () => {
    const commander = {
      id: 'b-n-g8',
      permanentName: 'Knight Commander Falk',
      characterName: 'Falk',
      fantasyType: 'knight-commander',
      originalSquare: 'g8',
      mythicArm: {
        id: 'stormbound-great-hammer',
        name: 'stormbound great hammer',
        description:
          'a stormbound great hammer whose impacts release concussive thunder',
      },
      capturedAtPly: 13,
    } as GameLedger['pieces'][number];
    const ledger = {
      initialFen: 'test-seed',
      pieces: [commander],
      events: [],
      metadata: {},
    } as GameLedger;

    const findings = validator.validateMythicArmOwnership(
      [
        {
          ply: 13,
          characters: [commander.id],
          fantasyNarration:
            'Falk alternated his oathbound swords, calculating routes through the rubble before the final blow killed him.',
        },
      ],
      ledger,
    );

    expect(findings).toEqual([
      expect.objectContaining({
        type: 'mythic-arm-ownership',
        severity: 'error',
        ply: 13,
        pieceId: commander.id,
        message:
          "Knight Commander Falk is attributed another Knight Commander's Mythic Arm; the assigned weapon is stormbound great hammer",
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

  it('treats substantive Fortress damage as a blocking wound to its integrated pilot', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Moving Fortress Pilot Mirelle',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 29, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 29,
            characters: ['w-r-a1'],
            fantasyNarration:
              "A collapsing root shelf crushed the forward armor assembly and shocked Mirelle's left side inside the cradle, leaving steering slow and the twin cannons less precise.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'error',
        ply: 29,
        pieceId: 'w-r-a1',
      }),
    ]);
  });

  it('does not treat harmless contact with intact Fortress armor as a wound', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Moving Fortress Pilot Mirelle',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 29, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 29,
            characters: ['w-r-a1'],
            fantasyNarration:
              "Enemy fire struck Mirelle's forward armor, but the plates held without damage and she continued at full speed.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([]);
  });

  it('does not mistake damage inflicted by Fortress weapons for damage to the Fortress', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Moving Fortress Pilot Mirelle',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 29, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 29,
            characters: ['w-r-a1'],
            fantasyNarration:
              "Mirelle's cannon damaged the stone gate and opened a route for the company.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([]);
  });

  it('does not mistake broken terrain near a cannon for Fortress damage', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'b-r-a8',
          permanentName: 'Southeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Ysolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 80, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 80,
            characters: ['b-r-a8', 'b-r-h8'],
            fantasyNarration:
              "Orin saw the encirclement: Mirelle's friendly Fortress sealed the rear approach, Ysolde controlled the broken ground and the cannon's lane, and Jareth controlled the remaining avenues of escape.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([]);
  });

  it('does not assign a target’s shattered armor to the Fortress firing the round', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Ysolde',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-k-e1',
          permanentName: 'Northern King',
          characterName: 'Orin',
          fantasyType: 'king',
        },
      ],
      events: [{ ply: 80, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 80,
            characters: ['b-r-h8', 'w-k-e1'],
            fantasyNarration:
              "The final assault tore through Orin's exhausted Seal bond as Ysolde's round shattered his chest armor and drove him to the ground.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([]);
  });

  it('assigns generic broken hull damage to the captured Fortress in a Fortress capture', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-r-h1',
          permanentName: 'Northwest Fortress',
          operatorName: 'Ysabet',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 34 }, (_, index) => ({
        ply: index + 1,
        isCapture: index === 33,
        pieceId: index === 33 ? 'b-r-h8' : 'b-p-a7',
        capturedPieceId: index === 33 ? 'w-r-h1' : undefined,
      })),
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 34,
            characters: ['b-r-h8', 'w-r-h1'],
            fantasyNarration:
              "She fired, then drove Southwest Fortress' wedge prow through the broken hull.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([]);
  });

  it('still blocks explicit damage to the attacking Fortress during a Fortress capture', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-r-h1',
          permanentName: 'Northwest Fortress',
          operatorName: 'Ysabet',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 34 }, (_, index) => ({
        ply: index + 1,
        isCapture: index === 33,
        pieceId: index === 33 ? 'b-r-h8' : 'b-p-a7',
        capturedPieceId: index === 33 ? 'w-r-h1' : undefined,
      })),
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 34,
            characters: ['b-r-h8', 'w-r-h1'],
            fantasyNarration:
              "Southwest Fortress' own axle snapped as Roderic rammed Northwest Fortress.",
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'error',
        pieceId: 'b-r-h8',
      }),
    ]);
  });

  it('treats ambiguous component damage during a Fortress capture as a warning', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Roderic',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-r-h1',
          permanentName: 'Northwest Fortress',
          operatorName: 'Ysabet',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 34 }, (_, index) => ({
        ply: index + 1,
        isCapture: index === 33,
        pieceId: index === 33 ? 'b-r-h8' : 'b-p-a7',
        capturedPieceId: index === 33 ? 'w-r-h1' : undefined,
      })),
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 34,
            characters: ['b-r-h8', 'w-r-h1'],
            fantasyNarration:
              'Roderic heard metal tear as the axle cracked during the collision before he reached Ysabet.',
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'warning',
        pieceId: 'b-r-h8',
      }),
    ]);
  });

  it('does not mistake healthy Fortress state or temporary motion for damage', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 55, isCapture: false }],
    } as GameLedger;

    for (const fantasyNarration of [
      'Mirelle reported that her engine could still maneuver, though the cradle was shaking around her.',
      'Mirelle kept the Northeast Fortress moving through the smoke and reported that its engine remained responsive.',
      'Mirelle confirmed that the cannon was ready.',
      "Moving Fortress Pilot Elowen fired the Northeast Fortress's breach cannon into harbor masonry beside Nessa.",
      'The engine failed to gain traction on the flooded stones before Mirelle found another route.',
    ]) {
      expect(
        validator.validateUnplannedInjuries(
          [{ ply: 55, characters: ['w-r-a1'], fantasyNarration }],
          [],
          fortressLedger,
        ),
      ).toEqual([]);
    }
  });

  it('blocks premature Fortress power loss but permits concrete mechanical obstruction', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 1, isCheckmate: true }],
    } as GameLedger;

    expect(
      validator.validatePrematureFortressPowerLoss(
        [
          {
            ply: 1,
            characters: ['w-r-a1'],
            fantasyNarration:
              "Mirelle's powerless-to-move hull blocked the final route.",
          },
        ],
        fortressLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'fortress-power-state',
        severity: 'error',
        pieceId: 'w-r-a1',
      }),
    ]);

    for (const fantasyNarration of [
      "Mirelle's damaged hull blocked the final route.",
      'Mirelle wedged the Fortress between two roots and held it stationary.',
      'Mirelle could not gain traction in the flooded trench.',
    ]) {
      expect(
        validator.validatePrematureFortressPowerLoss(
          [{ ply: 1, characters: ['w-r-a1'], fantasyNarration }],
          fortressLedger,
        ),
      ).toEqual([]);
    }
  });

  it('still blocks explicit Fortress damage states and destructive events', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 55, isCapture: false }],
    } as GameLedger;

    for (const fantasyNarration of [
      'Mirelle fought the controls as the engine remained crippled.',
      'Mirelle reeled inside the cradle as the axle snapped.',
      'Mirelle called for help when the hull collapsed.',
      'Mirelle could not advance after the engine failed completely.',
    ]) {
      expect(
        validator.validateUnplannedInjuries(
          [{ ply: 55, characters: ['w-r-a1'], fantasyNarration }],
          [],
          fortressLedger,
        ),
      ).toEqual([
        expect.objectContaining({
          type: 'invented-wound',
          severity: 'error',
          pieceId: 'w-r-a1',
        }),
      ]);
    }
  });

  it('does not mistake destruction of a nearby bridge for Fortress damage', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 55, isCapture: false }],
    } as GameLedger;

    expect(
      validator.validateUnplannedInjuries(
        [
          {
            ply: 55,
            characters: ['w-r-a1'],
            fantasyNarration:
              'Mirelle fired the cannon, and a nearby bridge was destroyed before the Northeast Fortress crossed the shattered approach.',
          },
        ],
        [],
        fortressLedger,
      ),
    ).toEqual([]);
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
        severity: 'error',
        pieceId: 'b-b-c8',
      }),
    ]);
  });

  it('does not transfer an explicitly possessed wound to a character in the preceding sentence', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Queen Odette',
          characterName: 'Odette',
          fantasyType: 'queen',
        },
        {
          id: 'w-n-g1',
          permanentName: 'Southeast Knight Commander Godric',
          characterName: 'Godric',
          fantasyType: 'knight-commander',
        },
      ],
      events: Array.from({ length: 25 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'w-n-g1',
        inflictedAtPly: 24,
        injury: 'fractured left forearm and torn shoulder',
        lastingEffects: ['weakened grip', 'restricted greatsword arc'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 25,
            characters: ['b-q-d8', 'w-n-g1'],
            fantasyNarration:
              "Odette rushed through the broken illusion line before Godric could leave. Godric's left forearm remained fractured and his shoulder torn from Kael's spell at the previous exchange; those injuries weakened his grip and kept him from completing the greatsword's full arc.",
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([]);
  });

  it('keeps a participial wound on the main subject instead of a possessive destination', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Northern Queen',
          characterName: 'Odette',
          fantasyType: 'queen',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Ysolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 71 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-q-d8',
        inflictedAtPly: 60,
        injury: 'abdominal puncture',
        lastingEffects: ['barrier failures'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 71,
            characters: ['b-q-d8', 'b-r-h8'],
            fantasyNarration:
              "Queen Odette rushed back through the forest toward Ysolde's Southwest Fortress, carrying the abdominal puncture and the barrier failures inflicted during her fight with Sabine.",
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([]);
  });

  it('keeps a pronoun-owned wound on the clause subject instead of a possessive object', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Northern Queen',
          characterName: 'Odette',
          fantasyType: 'queen',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Ysolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 71 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-q-d8',
        inflictedAtPly: 60,
        injury: 'puncture in the lower right abdomen',
        lastingEffects: ['damaged seals leaking beneath her armor'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 71,
            characters: ['b-q-d8', 'b-r-h8'],
            fantasyNarration:
              "Queen Odette rushed toward Ysolde's possible firing lane, one hand pressed against the puncture in her own lower right abdomen while damaged seals leaked beneath her armor.",
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([]);
  });

  it('downgrades a genuinely ambiguous pronoun owner to a warning', () => {
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
      events: Array.from({ length: 40 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-b-f8',
        inflictedAtPly: 12,
        injury: 'deeply slashed forearm',
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
              'Sabine reached Mara while her slashed forearm shook with pain.',
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'warning',
      }),
    ]);
  });

  it('still assigns a participial wound to a Fortress when the Fortress is the subject', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Northern Queen',
          characterName: 'Odette',
          fantasyType: 'queen',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Ysolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 71 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-q-d8',
        inflictedAtPly: 60,
        injury: 'abdominal puncture',
        lastingEffects: ['barrier failures'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 71,
            characters: ['b-q-d8', 'b-r-h8'],
            fantasyNarration:
              "Ysolde's Southwest Fortress moved toward Queen Odette, carrying the abdominal puncture and the barrier failures into the forest.",
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'error',
        pieceId: 'b-r-h8',
      }),
    ]);
  });

  it('still blocks a directly possessed wound transfer', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          permanentName: 'Northern Queen',
          characterName: 'Odette',
          fantasyType: 'queen',
        },
        {
          id: 'b-r-h8',
          permanentName: 'Southwest Fortress',
          operatorName: 'Ysolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 71 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-q-d8',
        inflictedAtPly: 60,
        injury: 'abdominal puncture',
        lastingEffects: ['barrier failures'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 71,
            characters: ['b-q-d8', 'b-r-h8'],
            fantasyNarration:
              "Queen Odette reached the trees. Ysolde's abdominal puncture caused the Southwest Fortress's barriers to fail.",
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'error',
        pieceId: 'b-r-h8',
      }),
    ]);
  });

  it('does not block a two-character capture scene because attack language resembles another wound', () => {
    const injuryLedger = {
      pieces: [
        {
          id: 'w-q-d1',
          permanentName: 'Northern Queen',
          characterName: 'Odette',
          fantasyType: 'queen',
        },
        {
          id: 'b-p-a7',
          permanentName: 'Ansel',
          characterName: 'Ansel',
          fantasyType: 'pawn',
        },
        {
          id: 'w-n-g1',
          permanentName: 'Southeast Knight Commander',
          characterName: 'Godric',
          fantasyType: 'knight-commander',
        },
      ],
      events: Array.from({ length: 67 }, (_, index) => ({
        ply: index + 1,
        isCapture: index === 66,
        pieceId: index === 66 ? 'w-q-d1' : 'w-p-a2',
        capturedPieceId: index === 66 ? 'b-p-a7' : undefined,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'w-n-g1',
        inflictedAtPly: 31,
        injury: 'ward-burning greatsword cut across the left shoulder',
        lastingEffects: ['pain beneath the collarbone'],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 67,
            characters: ['w-q-d1', 'b-p-a7'],
            fantasyNarration:
              'Odette cut through the weak ward and struck Ansel from collarbone to heart.',
          },
        ],
        wounds,
        injuryLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'warning',
        pieceId: 'w-q-d1',
      }),
    ]);
  });

  it('detects a future planned wound copied onto the wrong character', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Moving Fortress Pilot Mirelle',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-r-h1',
          permanentName: 'Moving Fortress Pilot Isolde',
          operatorName: 'Isolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 33 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'w-r-h1',
        inflictedAtPly: 33,
        injury:
          "Crushed forward armor assembly with severe shock damage to embedded pilot's left side",
        lastingEffects: [
          'Limited steering',
          'Internal pain',
          'Reduced cannon precision',
        ],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 29,
            characters: ['w-r-a1'],
            fantasyNarration:
              "Mirelle's forward armor assembly was crushed, shocking her left side and reducing the Fortress's steering and cannon precision.",
          },
        ],
        wounds,
        fortressLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'error',
        ply: 29,
        pieceId: 'w-r-a1',
      }),
    ]);
  });

  it('detects a paraphrased active wound transferred between Fortress pilots', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-r-h1',
          permanentName: 'Northwest Fortress',
          operatorName: 'Isolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 57 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'w-r-h1',
        inflictedAtPly: 33,
        injury:
          "Crushed steering and control linkage with severe trauma to the embedded pilot's left side",
        lastingEffects: [
          'Limited control response on the left side of the Fortress',
          'Constant pain through the life-support cradle',
          'Reduced ability to maneuver before the machine is captured',
        ],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 57,
            characters: ['w-r-a1'],
            fantasyNarration:
              'Moving Fortress Pilot Mirelle turned the Northeast Fortress toward the royal corridor. The dead control response on her left side made the turn slow and painful through the cradle.',
          },
        ],
        wounds,
        fortressLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'invented-wound',
        severity: 'error',
        ply: 57,
        pieceId: 'w-r-a1',
      }),
    ]);
  });

  it('allows ordinary shared Fortress terminology without transferred impairment', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'w-r-a1',
          permanentName: 'Northeast Fortress',
          operatorName: 'Mirelle',
          fantasyType: 'moving-fortress',
        },
        {
          id: 'w-r-h1',
          permanentName: 'Northwest Fortress',
          operatorName: 'Isolde',
          fantasyType: 'moving-fortress',
        },
      ],
      events: Array.from({ length: 57 }, (_, index) => ({
        ply: index + 1,
        isCapture: false,
      })),
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'w-r-h1',
        inflictedAtPly: 33,
        injury:
          "Crushed steering and control linkage with severe trauma to the embedded pilot's left side",
        lastingEffects: [
          'Limited control response on the left side of the Fortress',
          'Constant pain through the life-support cradle',
        ],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateWoundOwnershipTransfers(
        [
          {
            ply: 57,
            characters: ['w-r-a1'],
            fantasyNarration:
              'Mirelle checked the steering linkage, settled into the command cradle, and confirmed that the control response remained strong.',
          },
        ],
        wounds,
        fortressLedger,
      ),
    ).toEqual([]);
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

  it('detects royal check strain assigned to the checking side own King', () => {
    const checkLedger = {
      pieces: [
        {
          id: 'w-n-b1',
          side: 'north',
          permanentName: 'Knight Commander Catrin',
          fantasyType: 'knight-commander',
        },
        {
          id: 'w-k-e1',
          side: 'north',
          permanentName: 'King Ansel',
          fantasyType: 'king',
        },
        {
          id: 'b-k-e8',
          side: 'south',
          permanentName: 'King Ulric',
          fantasyType: 'king',
        },
      ],
      events: [
        {
          ply: 65,
          side: 'north',
          pieceId: 'w-n-b1',
          isCheck: true,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCheckStrainOwnership(
        [
          {
            ply: 65,
            fantasyNarration:
              "Catrin checked King Ulric, and the attack further battered King Ansel's already strained Seal defenses.",
          },
        ],
        checkLedger,
      ),
    ).toEqual([
      expect.objectContaining({
        severity: 'error',
        ply: 65,
        pieceId: 'b-k-e8',
      }),
    ]);
  });

  it('allows royal check strain assigned to the threatened King', () => {
    const checkLedger = {
      pieces: [
        {
          id: 'w-b-c1',
          side: 'north',
          permanentName: 'Archwizard Aveline',
          fantasyType: 'archwizard',
        },
        {
          id: 'w-k-e1',
          side: 'north',
          permanentName: 'King Ansel',
          fantasyType: 'king',
        },
        {
          id: 'b-k-e8',
          side: 'south',
          permanentName: 'King Ulric',
          fantasyType: 'king',
        },
      ],
      events: [
        {
          ply: 67,
          side: 'north',
          pieceId: 'w-b-c1',
          isCheck: true,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCheckStrainOwnership(
        [
          {
            ply: 67,
            fantasyNarration:
              "Aveline checked King Ulric, and the force spell cracked Ulric's personal wards around the Southern Seal.",
          },
        ],
        checkLedger,
      ),
    ).toEqual([]);
  });

  it("does not mistake a Queen's active wound for her protected King's check strain", () => {
    const checkLedger = {
      pieces: [
        {
          id: 'b-q-d8',
          side: 'south',
          permanentName: 'Queen Catrin',
          fantasyType: 'queen',
        },
        {
          id: 'w-k-e1',
          side: 'north',
          permanentName: 'King Gareth',
          fantasyType: 'king',
        },
        {
          id: 'b-k-e8',
          side: 'south',
          permanentName: 'King Emrys',
          fantasyType: 'king',
        },
      ],
      events: [
        {
          ply: 86,
          side: 'south',
          pieceId: 'b-q-d8',
          isCheck: true,
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCheckStrainOwnership(
        [
          {
            ply: 86,
            fantasyNarration:
              'Catrin’s burned side tightened beneath her armor, the old pain flaring along the breach, but she kept pressure on him while King Emrys remained unharmed.',
          },
        ],
        checkLedger,
      ),
    ).toEqual([]);
  });

  it('detects a distinctive later wound effect before its infliction', () => {
    const fortressLedger = {
      pieces: [
        {
          id: 'b-r-h8',
          permanentName: 'Moving Fortress Pilot Roderic',
          operatorName: 'Roderic',
          fantasyType: 'moving-fortress',
        },
      ],
      events: [{ ply: 52, isCapture: false }],
    } as GameLedger;
    const wounds = [
      {
        pieceId: 'b-r-h8',
        inflictedAtPly: 54,
        injury:
          'Fractured armor plates and a pierced outer ward around the command cradle',
        lastingEffects: [
          'Continuous magical leakage',
          'Increasing pain and breath restriction inside the cradle',
        ],
        recoveryPly: null,
      },
    ];

    expect(
      validator.validateTimedWounds(
        [
          {
            ply: 52,
            characters: ['b-r-h8'],
            fantasyNarration:
              'Magical leakage strained Roderic’s breathing inside the cradle.',
            woundsInflicted: [],
          },
        ],
        wounds,
        fortressLedger,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'wound-continuity',
          severity: 'warning',
          ply: 52,
          pieceId: 'b-r-h8',
        }),
      ]),
    );
  });

  it('rejects a checkmate scene that explicitly leaves the defeated King alive', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'checkmate' },
      pieces: [
        {
          id: 'w-k-e1',
          side: 'north',
          fantasyType: 'king',
          permanentName: 'Northern King',
          characterName: 'Orin',
        },
      ],
      events: [
        {
          ply: 80,
          isCheckmate: true,
          checkmateExplanation: { kingId: 'w-k-e1' },
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCheckmateKingDeath(
        [
          {
            ply: 80,
            fantasyNarration:
              'Ysolde fired. The round ruptured Orin’s Seal conduit, leaving him alive but unable to answer the attack.',
          },
        ],
        ledger,
      ),
    ).toEqual([
      expect.objectContaining({
        type: 'missing-checkmate',
        severity: 'error',
        ply: 80,
        pieceId: 'w-k-e1',
      }),
    ]);
  });

  it('accepts an explicit on-page death in the final checkmate scene', () => {
    const ledger = {
      metadata: { result: '0-1', termination: 'checkmate' },
      pieces: [
        {
          id: 'w-k-e1',
          side: 'north',
          fantasyType: 'king',
          permanentName: 'Northern King',
          characterName: 'Orin',
        },
      ],
      events: [
        {
          ply: 80,
          isCheckmate: true,
          checkmateExplanation: { kingId: 'w-k-e1' },
        },
      ],
    } as GameLedger;

    expect(
      validator.validateCheckmateKingDeath(
        [
          {
            ply: 80,
            fantasyNarration:
              'Ysolde fired. The round ruptured Orin’s exhausted Seal conduit and killed him.',
          },
        ],
        ledger,
      ),
    ).toEqual([]);
  });
});
