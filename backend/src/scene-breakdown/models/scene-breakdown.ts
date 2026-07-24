import { z } from 'zod';

export const storySceneSchema = z.object({
  id: z.string().min(1),
  actNumber: z.number().int().positive(),
  sceneNumber: z.number().int().positive(),
  startPly: z.number().int().positive(),
  endPly: z.number().int().positive(),
  involvedMoves: z.array(z.string().min(1)).min(1),
  chessExplanation: z.string().min(1),
  fantasyNarration: z.string().min(1),
  characters: z.array(z.string().min(1)),
  locations: z.array(z.string().min(1)),
  deaths: z.array(z.string().min(1)),
  promotions: z.array(z.string().min(1)),
  visualPrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  estimatedDurationSeconds: z.number().int().positive(),
  continuityNotes: z.array(z.string().min(1)),
});

export const sceneBreakdownSchema = z.object({
  scenes: z.array(storySceneSchema).min(1),
});

export type SceneBreakdown = z.infer<typeof sceneBreakdownSchema>;
