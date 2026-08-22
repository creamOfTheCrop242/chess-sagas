import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from './models/story-outline';
import { normalizeStoryOutlineCheckStrain } from './story-outline.service';

describe('normalizeStoryOutlineCheckStrain', () => {
  it('replaces model-authored check ownership with ledger-derived ownership', () => {
    const outline = {
      acts: [
        {
          scenes: [
            {
              startPly: 65,
              endPly: 67,
              continuityNotes: [
                'Ply 65 adds another cumulative check increment to King Ansel.',
                'Ply 66 adds a new cumulative check increment to King Ulric.',
                'Ply 67 adds another cumulative check increment to King Ansel.',
              ],
            },
          ],
        },
      ],
    } as StoryOutline;
    const ledger = {
      pieces: [
        {
          id: 'w-n-b1',
          side: 'north',
          permanentName: 'Knight Commander Catrin',
          fantasyType: 'knight-commander',
        },
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
        { ply: 65, side: 'north', pieceId: 'w-n-b1', isCheck: true },
        { ply: 66, side: 'south', pieceId: 'b-k-e8', isCheck: false },
        { ply: 67, side: 'north', pieceId: 'w-b-c1', isCheck: true },
      ],
    } as GameLedger;

    const normalized = normalizeStoryOutlineCheckStrain(outline, ledger);
    const notes = normalized.acts[0].scenes[0].continuityNotes;

    expect(notes).toHaveLength(2);
    expect(notes.join(' ')).toContain(
      'Ply 65 is a ledger-confirmed check delivered by Knight Commander Catrin against King Ulric.',
    );
    expect(notes.join(' ')).toContain(
      'Ply 67 is a ledger-confirmed check delivered by Archwizard Aveline against King Ulric.',
    );
    expect(notes.join(' ')).toContain('does not damage King Ansel');
    expect(notes.join(' ')).not.toContain('Ply 66');
  });
});
