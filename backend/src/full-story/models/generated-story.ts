import { z } from 'zod';
import { DEFEATED_KING_FATES } from '../../chess/models/story-ending';
import { battlefieldEnvironmentSchema } from '../../narrative-analysis/models/narrative-analysis';

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
  battlefieldEnvironment: battlefieldEnvironmentSchema,
  title: z.string().min(1),
  epilogue: z.string().min(120),
  laterEpilogueHeading: z.string().min(1).max(80),
  laterEpilogue: z.string().min(80),
  defeatedKingDeathDescription: z.string().min(1).max(280).nullable(),
  defeatedKingFate: z.enum(DEFEATED_KING_FATES),
  defeatedSealFate: z.enum(['destroyed', 'intact']),
  survivingFortressOutcomes: z.array(
    z.object({
      pieceId: z.string().min(1),
      operatorName: z.string().min(1),
      side: z.enum(['north', 'south']),
      powerOutcome: z.enum(['retains-seal-power', 'loses-seal-power']),
    }),
  ),
  wounds: z.array(storyWoundSchema).default([]),
  scenes: z
    .array(
      z.object({
        ply: z.number().int().positive(),
        fantasyNarration: z.string().min(1),
        characters: z.array(z.string().min(1)),
        locations: z.array(z.string().min(1)),
        captureActorId: z.string().min(1).nullable(),
        captureVictimId: z.string().min(1).nullable(),
        victimDies: z.boolean(),
        woundsInflicted: z
          .array(
            z.object({
              pieceId: z.string().min(1),
              inflictedAtPly: z.number().int().positive(),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

export type GeneratedStoryPackage = z.infer<typeof generatedStoryPackageSchema>;
