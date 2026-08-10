import { createLedgerConstrainedNarrativeAnalysisSchema } from './narrative-analysis';

describe('createLedgerConstrainedNarrativeAnalysisSchema', () => {
  const schema = createLedgerConstrainedNarrativeAnalysisSchema([
    'w-k-e1',
    'b-k-e8',
  ]);

  it('accepts ledger piece IDs in every character reference field', () => {
    expect(() =>
      schema.shape.characterImportance.parse([
        { pieceId: 'w-k-e1', score: 8, reason: 'Leads the defense.' },
      ]),
    ).not.toThrow();
    expect(() =>
      schema.shape.relationshipPlans.parse([
        {
          id: 'rival-kings',
          characterIds: ['w-k-e1', 'b-k-e8'],
          relationshipType: 'rivals',
          startingDynamic: 'They contest the field.',
          developmentPlies: [1],
          payoffPly: 2,
          intendedChange: 'Their conflict is resolved.',
        },
        {
          id: 'uneasy-respect',
          characterIds: ['b-k-e8', 'w-k-e1'],
          relationshipType: 'adversaries',
          startingDynamic: 'Neither understands the other.',
          developmentPlies: [1],
          payoffPly: null,
          intendedChange: 'They recognize a shared burden.',
        },
      ]),
    ).not.toThrow();
  });

  it('rejects invented piece IDs before ledger validation', () => {
    expect(() =>
      schema.shape.characterImportance.parse([
        { pieceId: 'w-q-d8', score: 8, reason: 'Invented identifier.' },
      ]),
    ).toThrow();
    expect(() =>
      schema.shape.acts.parse([
        {
          title: 'Opening',
          startPly: 1,
          endPly: 2,
          purpose: 'Establish the battle.',
          emotionalTone: 'Tense',
          majorCharacters: ['b-p-c2'],
        },
      ]),
    ).toThrow();
  });
});
