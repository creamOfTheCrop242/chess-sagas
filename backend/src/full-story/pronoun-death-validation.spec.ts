import type { GameLedger } from '../chess/models/game-ledger';
import { DeterministicStoryValidator } from '../story-validation/deterministic-story.validator';
import { FullStoryService } from './full-story.service';

describe('Possessive death references', () => {
  const validator = new DeterministicStoryValidator();
  const ledger = {
    pieces: [
      {
        id: 'w-p-d2',
        permanentName: 'Jasper',
        viewpointName: 'Jasper',
        pronouns: 'he/him',
        capturedAtPly: 42,
      },
    ],
  } as GameLedger;
  const prose =
    'Jasper’s unfinished accounting stayed in her mind as a hard fact: if she did nothing, his work and his death would buy nothing.';
  const detect = (text: string, ply = 41) =>
    validator.validateTimedCharacterFates(
      [{ ply, fantasyNarration: text }],
      ledger,
    );

  it('discovers the reported premature reference as a warning without scene character metadata', () => {
    expect(detect(prose)).toEqual([
      expect.objectContaining({
        severity: 'warning',
        pieceId: 'w-p-d2',
        ply: 41,
        excerpt: prose,
      }),
    ]);
  });
  it.each([
    'Jasper feared his death would be painful.',
    'Jasper said his death had not happened.',
    'Jasper saw Nolan fall and mourned his death.',
  ])('does not hard-fail ambiguous prose: %s', (text) => {
    expect(detect(text)).toEqual([
      expect.objectContaining({ severity: 'warning' }),
    ]);
  });
  it('preserves explicit named death errors', () => {
    expect(detect('Jasper’s death ended the assault.')[0].severity).toBe(
      'error',
    );
  });
  it('accepts references at and after the authorized death', () => {
    expect(detect(prose, 42)).toEqual([]);
    expect(detect(prose, 43)).toEqual([]);
  });
  it('does not infer ownership across unrelated sentences', () => {
    expect(detect('Jasper waited. His death was remembered.')).toEqual([]);
  });
  it('supports female possessives', () => {
    const female = {
      pieces: [
        {
          ...ledger.pieces[0],
          permanentName: 'Nessa',
          viewpointName: 'Nessa',
          pronouns: 'she/her',
        },
      ],
    } as GameLedger;
    expect(
      validator.validateTimedCharacterFates(
        [{ ply: 41, fantasyNarration: 'Nessa feared her death.' }],
        female,
      )[0].severity,
    ).toBe('warning');
  });

  async function adjudicate(decision: boolean | undefined | Error) {
    const findings = detect(prose);
    const provider = {
      adjudicatePossiblePrematureDeaths: jest.fn(async () => {
        if (decision instanceof Error) throw decision;
        return {
          findings:
            decision === undefined
              ? []
              : [
                  {
                    findingIndex: 0,
                    contradiction: decision,
                    confidence: 'high',
                  },
                ],
        };
      }),
    };
    const context = { provider, logger: { log: jest.fn(), warn: jest.fn() } };
    const method = FullStoryService.prototype['adjudicateAmbiguousTimedFates'];
    const validation = { timedFateFindings: findings, findings } as Parameters<
      typeof method
    >[0];
    const result = await method.call(
      context as unknown as FullStoryService,
      validation,
      [{ startPly: 41, fantasyNarration: prose }],
      ledger,
      'game',
      'run',
      1,
    );
    expect(provider.adjudicatePossiblePrematureDeaths).toHaveBeenCalledWith(
      expect.objectContaining({
        findings: [
          expect.objectContaining({
            characterName: 'Jasper',
            capturedAtPly: 42,
            sceneNarration: prose,
          }),
        ],
      }),
    );
    return result;
  }
  it('promotes a confirmed contradiction in both finding collections', async () => {
    const result = await adjudicate(true);
    expect(result.timedFateFindings[0].severity).toBe('error');
    expect(result.findings[0].severity).toBe('error');
  });
  it('removes a cleared false positive', async () => {
    const result = await adjudicate(false);
    expect(result.timedFateFindings).toEqual([]);
    expect(result.findings).toEqual([]);
  });
  it.each([undefined, new Error('provider unavailable')])(
    'keeps an unconfirmed candidate nonblocking (%s)',
    async (decision) => {
      const result = await adjudicate(decision);
      expect(result.timedFateFindings[0].severity).toBe('warning');
      expect(result.findings[0].severity).toBe('warning');
    },
  );
});
