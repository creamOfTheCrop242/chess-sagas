import { BadGatewayException } from '@nestjs/common';
import type { SceneBreakdown } from '../scene-breakdown/models/scene-breakdown';
import type { StoryValidationResult } from './models/story-validation';
import {
  applyStoryValidationPatches,
  assembleValidatedStoryMarkdown,
} from './story-validation.service';

function sourceBreakdown(): SceneBreakdown {
  const base = {
    chessExplanation: 'A move occurs.',
    characters: ['w-p-e2'],
    locations: ['road'],
    deaths: [],
    promotions: [],
    visualPrompt: 'A dark road.',
    videoPrompt: 'A slow advance.',
    estimatedDurationSeconds: 10,
    continuityNotes: ['The road continues.'],
  };
  return {
    scenes: [
      {
        ...base,
        id: 'one',
        actNumber: 1,
        sceneNumber: 1,
        startPly: 1,
        endPly: 1,
        involvedMoves: ['e4'],
        fantasyNarration: 'Original first scene.',
      },
      {
        ...base,
        id: 'two',
        actNumber: 1,
        sceneNumber: 2,
        startPly: 2,
        endPly: 2,
        involvedMoves: ['e5'],
        fantasyNarration: 'Original second scene.',
      },
    ],
    wounds: [],
    epilogue: 'Original aftermath.',
    laterEpilogueHeading: 'Three Winters Later',
    laterEpilogue: 'Original later chronicle.',
    defeatedKingDeathDescription: null,
    defeatedKingFate: 'survives',
    defeatedSealFate: 'intact',
    survivingFortressOutcomes: [],
  };
}

function result(
  overrides: Partial<StoryValidationResult> = {},
): StoryValidationResult {
  return {
    findings: [],
    scenePatches: [],
    epiloguePatch: null,
    laterEpilogueHeadingPatch: null,
    laterEpiloguePatch: null,
    ...overrides,
  };
}

describe('structured story validation patches', () => {
  it('changes only the explicitly patched prose', () => {
    const source = sourceBreakdown();
    const repaired = applyStoryValidationPatches(
      source,
      result({
        scenePatches: [{ ply: 2, fantasyNarration: 'Corrected second scene.' }],
        laterEpilogueHeadingPatch: '## Five Years Later',
      }),
    );

    expect(repaired.scenes[0]).toEqual(source.scenes[0]);
    expect(repaired.scenes[1]).toEqual({
      ...source.scenes[1],
      fantasyNarration: 'Corrected second scene.',
    });
    expect(repaired.laterEpilogueHeading).toBe('Five Years Later');
    expect(repaired.epilogue).toBe(source.epilogue);
    expect(assembleValidatedStoryMarkdown(repaired, ['The Road'])).toContain(
      'Corrected second scene.',
    );
  });

  it('rejects unknown and duplicate ply patches', () => {
    expect(() =>
      applyStoryValidationPatches(
        sourceBreakdown(),
        result({
          scenePatches: [{ ply: 3, fantasyNarration: 'Unknown.' }],
        }),
      ),
    ).toThrow(BadGatewayException);
    expect(() =>
      applyStoryValidationPatches(
        sourceBreakdown(),
        result({
          scenePatches: [
            { ply: 1, fantasyNarration: 'First.' },
            { ply: 1, fantasyNarration: 'Duplicate.' },
          ],
        }),
      ),
    ).toThrow('duplicate patches for ply 1');
  });
});
