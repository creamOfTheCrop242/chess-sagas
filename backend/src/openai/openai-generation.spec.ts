import { serializeRequestWithCharacterRegistry } from './openai-generation';

describe('OpenAI generation request serialization', () => {
  it('sends the character registry once without losing ledger data', () => {
    const serialized = serializeRequestWithCharacterRegistry({
      ledger: {
        metadata: { result: '1-0' },
        events: [{ ply: 1, san: 'e4' }],
        pieces: [{ id: 'w-p-e2', viewpointName: 'Alden' }],
      },
      characterRegistry: [{ id: 'w-p-e2', viewpointName: 'Alden' }],
      outline: { title: 'The Opening' },
    });

    const request = JSON.parse(serialized) as {
      ledger: {
        metadata: { result: string };
        events: Array<{ ply: number; san: string }>;
        pieces?: unknown[];
      };
      characterRegistry: Array<{ id: string; viewpointName: string }>;
      outline: { title: string };
    };

    expect(request.ledger.pieces).toBeUndefined();
    expect(request.ledger.metadata.result).toBe('1-0');
    expect(request.ledger.events).toEqual([{ ply: 1, san: 'e4' }]);
    expect(request.characterRegistry).toEqual([
      { id: 'w-p-e2', viewpointName: 'Alden' },
    ]);
    expect(request.outline).toEqual({ title: 'The Opening' });
  });
});
