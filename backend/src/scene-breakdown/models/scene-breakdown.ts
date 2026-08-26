import { z } from 'zod';
import { storyWoundSchema } from '../../full-story/models/generated-story';
import { DEFEATED_KING_FATES } from '../../chess/models/story-ending';

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
  captureActorId: z.string().min(1).nullable().optional(),
  captureVictimId: z.string().min(1).nullable().optional(),
  woundsInflicted: z
    .array(
      z.object({
        pieceId: z.string().min(1),
        inflictedAtPly: z.number().int().positive(),
      }),
    )
    .optional(),
  woundReferences: z
    .array(
      z.object({
        woundId: z.string().min(1),
        ownerPieceId: z.string().min(1),
      }),
    )
    .optional(),
  promotions: z.array(z.string().min(1)),
  visualPrompt: z.string().min(1),
  videoPrompt: z.string().min(1),
  estimatedDurationSeconds: z.number().int().positive(),
  continuityNotes: z.array(z.string().min(1)),
});

export const sceneBreakdownSchema = z.object({
  scenes: z.array(storySceneSchema).min(1),
  wounds: z.array(storyWoundSchema).default([]),
  epilogue: z.string().min(1).nullable(),
  laterEpilogueHeading: z.string().min(1).max(80).nullable(),
  laterEpilogue: z.string().min(1).nullable(),
  defeatedKingDeathDescription: z.string().min(1).max(280).nullable(),
  defeatedKingFate: z.enum(DEFEATED_KING_FATES),
  defeatedSealFate: z.enum(['destroyed', 'intact']),
  survivingFortressOutcomes: z
    .array(
      z.object({
        pieceId: z.string().min(1),
        operatorName: z.string().min(1),
        side: z.enum(['north', 'south']),
        powerOutcome: z.enum(['retains-seal-power', 'loses-seal-power']),
      }),
    )
    .default([]),
});

export type SceneBreakdown = z.infer<typeof sceneBreakdownSchema>;
