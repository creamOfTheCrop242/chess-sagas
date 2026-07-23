import { z } from 'zod';

const outlineSceneSchema = z.object({
  sceneNumber: z.number().int().positive(),
  title: z.string().min(1),
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  purpose: z.string().min(1),
  emotionalBeat: z.string().min(1),
  characters: z.array(z.string().min(1)),
  requiredEventPlies: z.array(z.number().int().positive()),
  continuityNotes: z.array(z.string().min(1)),
});

const outlineActSchema = z.object({
  actNumber: z.number().int().positive(),
  title: z.string().min(1),
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  purpose: z.string().min(1),
  scenes: z.array(outlineSceneSchema).min(1),
});

const setupPayoffSchema = z.object({
  id: z.string().min(1),
  setupPlies: z.array(z.number().int().positive()).min(1),
  payoffPly: z.number().int().positive(),
  setup: z.string().min(1),
  payoff: z.string().min(1),
});

const endingBeatSchema = z.object({
  ply: z.number().int().positive(),
  beat: z.string().min(1),
});

export const storyOutlineSchema = z.object({
  selectedTitle: z.string().min(1),
  theme: z.string().min(1),
  acts: z.array(outlineActSchema).min(1),
  setupPayoffs: z.array(setupPayoffSchema),
  endingSequence: z.array(endingBeatSchema).min(1),
  proseConstraints: z.array(z.string().min(1)).min(1),
});

export type StoryOutline = z.infer<typeof storyOutlineSchema>;
