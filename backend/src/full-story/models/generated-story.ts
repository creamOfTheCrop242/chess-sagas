import { z } from 'zod';

export const generatedStorySchema = z.object({
  title: z.string().min(1),
  storyMarkdown: z.string().min(500),
});

export type GeneratedStoryDraft = z.infer<typeof generatedStorySchema>;

export const generatedStoryPackageSchema = z.object({
  title: z.string().min(1),
  defeatedKingFate: z.enum([
    'killed-after-checkmate',
    'suicide-after-surrender',
    'survives',
  ]),
  scenes: z
    .array(
      z.object({
        ply: z.number().int().positive(),
        fantasyNarration: z.string().min(1),
        characters: z.array(z.string().min(1)),
        locations: z.array(z.string().min(1)),
        decisiveActorId: z.string().min(1).nullable(),
      }),
    )
    .min(1),
});

export type GeneratedStoryPackage = z.infer<typeof generatedStoryPackageSchema>;
