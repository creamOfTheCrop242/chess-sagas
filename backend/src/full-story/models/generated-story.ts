import { z } from 'zod';

export const generatedStorySchema = z.object({
  title: z.string().min(1),
  storyMarkdown: z.string().min(500),
});

export type GeneratedStoryDraft = z.infer<typeof generatedStorySchema>;

export const storyWoundSchema = z.object({
  pieceId: z.string().min(1),
  inflictedAtPly: z.number().int().positive(),
  injury: z.string().min(1),
  lastingEffects: z.array(z.string().min(1)).min(1),
  recoveryPly: z.number().int().positive().nullable(),
});

export const generatedStoryPackageSchema = z.object({
  title: z.string().min(1),
  epilogue: z.string().min(150),
  defeatedKingFate: z.enum([
    'killed-after-checkmate',
    'suicide-after-surrender',
    'survives',
  ]),
  defeatedSealFate: z.enum(['destroyed', 'intact']),
  wounds: z.array(storyWoundSchema).default([]),
  scenes: z
    .array(
      z.object({
        ply: z.number().int().positive(),
        fantasyNarration: z.string().min(1),
        characters: z.array(z.string().min(1)),
        locations: z.array(z.string().min(1)),
      }),
    )
    .min(1),
});

export type GeneratedStoryPackage = z.infer<typeof generatedStoryPackageSchema>;
