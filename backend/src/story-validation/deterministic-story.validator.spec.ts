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
});
