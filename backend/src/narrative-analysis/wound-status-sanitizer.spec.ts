import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import { PgnService } from '../pgn/pgn.service';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import { sanitizeWoundStatusText } from './wound-status-sanitizer';

describe('sanitizeWoundStatusText', () => {
  const ledger = new PgnService(
    new GameLedgerService(new PieceIdentityService()),
  ).parse(
    '[White "Ada"]\n[Black "Turing"]\n[Result "1-0"]\n\n1. e4 d5 2. exd5 Qxd5 3. Nc3 Qe5+ 4. Be2 1-0',
  ).ledger;
  const owner = ledger.pieces.find((piece) => piece.id === 'w-p-e2')!;
  const source = ledger.pieces.find((piece) => piece.id === 'b-p-d7')!;

  it('replaces identities and removes chess metadata without an AI call', () => {
    const analysis = makeAnalysis(
      `${owner.permanentName}'s ribs are fractured by ${source.permanentName} at d5 on ply 3.`,
      [
        `Pain returns near w-q-d1.`,
        `${owner.permanentName} cannot turn toward c6.`,
      ],
    );

    const repaired = sanitizeWoundStatusText(analysis, ledger).woundPlans[0];

    expect(repaired.injury).toBe('His ribs are fractured by the attacker.');
    expect(repaired.lastingEffects).toEqual([
      'Pain returns.',
      'He cannot turn.',
    ]);
  });

  it('leaves clean status language unchanged', () => {
    const analysis = makeAnalysis('Fractured ribs', [
      'Painful breathing',
      'Reduced torso movement',
    ]);

    expect(
      sanitizeWoundStatusText(analysis, ledger).woundPlans[0],
    ).toMatchObject(analysis.woundPlans[0]);
  });

  it('uses deterministic fallbacks when forbidden metadata is all that remains', () => {
    const analysis = makeAnalysis(owner.permanentName, ['ply 3', 'd5']);

    expect(
      sanitizeWoundStatusText(analysis, ledger).woundPlans[0],
    ).toMatchObject({
      injury: 'Painful impact injury',
      lastingEffects: ['Persistent pain and reduced mobility'],
    });
  });

  it("replaces another commander's Mythic Arm with the wound owner's weapon", () => {
    const commander = ledger.pieces.find((piece) => piece.id === 'w-n-b1')!;
    const commanderLedger = {
      ...ledger,
      pieces: ledger.pieces.map((piece) =>
        piece.id === commander.id
          ? {
              ...piece,
              mythicArm: {
                id: 'stormbound-great-hammer' as const,
                name: 'stormbound great hammer',
                description:
                  'a stormbound great hammer whose impacts release concussive thunder',
              },
            }
          : piece,
      ),
    };
    const analysis = {
      woundPlans: [
        {
          pieceId: commander.id,
          inflictedAtPly: 12,
          injury:
            'A forced realm-light strike tears through the right forearm and splits the bracer.',
          lastingEffects: ['Limited overhead sword movement'],
          recoveryPly: null,
          causeType: 'self-inflicted-strain',
          sourcePieceId: null,
        },
      ],
    } as NarrativeAnalysis;

    const repaired = sanitizeWoundStatusText(analysis, commanderLedger)
      .woundPlans[0];

    expect(repaired.injury).toContain('stormbound great hammer');
    expect(repaired.injury).not.toContain('realm-light strike');
    expect(repaired.lastingEffects.join(' ')).toContain('hammer');
    expect(repaired.lastingEffects.join(' ')).not.toContain('sword');
  });

  function makeAnalysis(
    injury: string,
    lastingEffects: string[],
  ): NarrativeAnalysis {
    return {
      woundPlans: [
        {
          pieceId: owner.id,
          inflictedAtPly: 3,
          injury,
          lastingEffects,
          recoveryPly: null,
          causeType: 'environmental-damage',
          sourcePieceId: source.id,
        },
      ],
    } as NarrativeAnalysis;
  }
});
