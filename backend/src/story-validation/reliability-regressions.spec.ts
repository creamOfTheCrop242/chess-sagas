import fixture from './fixtures/reliability-v111.json';
import type { GameLedger } from '../chess/models/game-ledger';
import type { GeneratedStoryPackage } from '../full-story/models/generated-story';
import { DeterministicStoryValidator } from './deterministic-story.validator';

// Offline evidence replay. Full original packages are unavailable: these are
// exact logged excerpts plus saved analysis contracts, not a whole-run replay.
const ledger = fixture.ledger as unknown as GameLedger;
const wounds = fixture.wounds as GeneratedStoryPackage['wounds'];
const validator = new DeterministicStoryValidator();
const errors = (
  findings: ReturnType<typeof validator.validateUnplannedInjuries>,
) => findings.filter((f) => f.severity === 'error');
const scene = (
  ply: number,
  fantasyNarration: string,
  characters: string[],
) => ({ ply, fantasyNarration, characters });

describe('retained v111 reliability cases', () => {
  // Formerly expected failures; now ordinary assertions of corrected behavior.
  it('does not transfer an authorized eye injury to another owner', () => {
    const findings = validator.validateWoundOwnershipTransfers(
      [
        scene(
          21,
          'the axe head struck Percival across the eye and filled his vision with blood.',
          ['w-p-b2', 'b-n-b8', 'w-p-g2'],
        ),
      ],
      wounds,
      ledger,
    );
    expect(errors(findings)).toEqual([]);
  });

  it('does not treat post-mate Seal shutdown as physical Fortress damage', () => {
    expect(
      errors(
        validator.validateUnplannedInjuries(
          [
            scene(
              46,
              'The Northern Royal Seal broke apart after him, ending its current at once: ward-stones went dark, enchanted weapons failed, and the Northern Fortresses stopped where Sabine and Petra remained embedded inside.',
              ['w-r-a1', 'w-r-h1'],
            ),
          ],
          wounds,
          ledger,
        ),
      ),
    ).toEqual([]);
  });

  it('does not call explicitly intact operational engines damaged', () => {
    expect(
      errors(
        validator.validateUnplannedInjuries(
          [
            scene(
              46,
              'Ward-stones went dark and enchanted weapons failed across the northern lines, while Northeast Fortress and Northwest Fortress remained intact, their engines and integrated systems still operational with Sabine and Petra within them.',
              ['w-r-a1', 'w-r-h1'],
            ),
          ],
          wounds,
          ledger,
        ),
      ),
    ).toEqual([]);
  });

  it('still flags an actual unplanned Fortress wound', () => {
    expect(
      errors(
        validator.validateUnplannedInjuries(
          [
            scene(
              40,
              'Northeast Fortress suffered a shattered axle and its hull was torn open.',
              ['w-r-a1'],
            ),
          ],
          wounds,
          ledger,
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('still flags an explicit ownership swap', () => {
    expect(
      errors(
        validator.validateWoundOwnershipTransfers(
          [
            scene(
              30,
              "Percival's forearm was fractured, leaving reduced grip and poor weapon control.",
              ['w-p-b2', 'b-b-f8'],
            ),
          ],
          wounds,
          ledger,
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('does not accept removal of an eye under an impaired-eye contract', () => {
    expect(
      errors(
        validator.validateWoundOwnershipTransfers(
          [scene(21, "Percival's eye was torn out.", ['w-p-b2'])],
          wounds,
          ledger,
        ),
      ).length,
    ).toBeGreaterThan(0);
    expect(
      errors(
        validator.validateWoundOwnershipTransfers(
          [scene(21, 'Percival feared his eye would be torn out.', ['w-p-b2'])],
          wounds,
          ledger,
        ),
      ),
    ).toEqual([]);
  });

  it.each([
    'Northeast Fortress remained intact, but its axle shattered.',
    'Northeast Fortress had an undamaged hull and its axle shattered.',
    "Northeast Fortress's hull was torn open after the King died.",
  ])('still detects real component damage: %s', (text) => {
    expect(
      errors(
        validator.validateUnplannedInjuries(
          [scene(46, text, ['w-r-a1'])],
          wounds,
          ledger,
        ),
      ).length,
    ).toBeGreaterThan(0);
  });

  it.each([
    'Northeast Fortress had no shattered axle.',
    'Northeast Fortress had a hull that was not damaged.',
    'Northeast Fortress remained intact while the bridge collapsed.',
  ])(
    'does not treat negation or terrain damage as Fortress damage: %s',
    (text) => {
      expect(
        errors(
          validator.validateUnplannedInjuries(
            [scene(40, text, ['w-r-a1'])],
            wounds,
            ledger,
          ),
        ),
      ).toEqual([]);
    },
  );

  it('keeps premature power loss in the separate power validator', () => {
    expect(
      errors(
        validator.validatePrematureFortressPowerLoss(
          [scene(40, 'Northeast Fortress lost all power.', ['w-r-a1'])],
          ledger,
        ),
      ).length,
    ).toBeGreaterThan(0);
  });
});
