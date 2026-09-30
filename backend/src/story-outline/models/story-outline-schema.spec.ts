import { zodTextFormat } from 'openai/helpers/zod';
import {
  storyOutlineSchema,
  storyOutlineGenerationSchema,
} from './story-outline';

describe('ending action plan compatibility', () => {
  it('accepts an absent legacy plan and an explicit null', () => {
    expect(
      storyOutlineSchema.shape.endingActionPlan.parse(undefined),
    ).toBeUndefined();
    expect(storyOutlineSchema.shape.endingActionPlan.parse(null)).toBeNull();
  });

  it('produces a strict generation schema without unsupported optional fields', () => {
    const format = zodTextFormat(storyOutlineGenerationSchema, 'story_outline');
    const schema = format.schema as { required: string[] };
    expect(schema.required).toContain('endingActionPlan');
    expect(schema.required).toContain('characterThreads');
    const thread = {
      pieceId: 'a',
      personalWant: 'Command',
      personalStake: 'Authority',
      initialBehavior: 'Demanding',
      moments: [
        { ply: 1, choiceOrReaction: 'Waits', changeFromEarlier: 'Doubts' },
      ],
      endingConnection: 'Loses command',
    };
    expect(
      storyOutlineSchema.shape.characterThreads.safeParse([thread]).success,
    ).toBe(true);
    expect(
      storyOutlineGenerationSchema.shape.characterThreads.safeParse([thread])
        .success,
    ).toBe(false);
    expect(
      storyOutlineGenerationSchema.shape.characterThreads.safeParse([
        {
          ...thread,
          endingSetupPly: null,
          moments: [{ ...thread.moments[0], respondsToPly: null }],
        },
      ]).success,
    ).toBe(true);
    expect(
      storyOutlineSchema.shape.characterThreads.parse(undefined),
    ).toBeUndefined();
    expect(
      storyOutlineGenerationSchema.shape.characterThreads.parse(null),
    ).toBeNull();
    expect(
      storyOutlineGenerationSchema.shape.endingActionPlan.safeParse(undefined)
        .success,
    ).toBe(false);
    expect(
      storyOutlineGenerationSchema.shape.endingActionPlan.safeParse(null)
        .success,
    ).toBe(true);
  });
});
