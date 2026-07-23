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
});
