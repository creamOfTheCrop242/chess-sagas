import { z } from 'zod';

export const validationFindingTypeSchema = z.enum([
  'missing-capture',
  'invented-capture',
  'survivor-killed',
  'captured-piece-survives',
  'wrong-captor',
  'missing-revenge-payoff',
  'missing-check',
  'missing-checkmate',
  'wrong-winner',
  'wrong-promotion',
  'premature-promotion-reveal',
  'dead-character-reappears',
  'queen-missing-swordplay',
  'queen-missing-magic',
  'queen-missing-superhuman-speed',
  'queen-incorrect-teleportation',
  'archwizard-missing-teleportation',
  'archwizard-magic-restricted-to-teleportation',
  'moving-fortress-canon',
  'invented-wound',
  'missing-wound',
  'wound-continuity',
  'mythic-arm-ownership',
  'fortress-entombment-aftermath',
  'fortress-power-state',
  'inconsistent-piece-name',
  'coordinate-mentioned-in-prose',
  'chess-terminology',
  'outline-continuity',
  'pawn-ability-contract',
]);

export const validationFindingSchema = z.object({
  type: validationFindingTypeSchema,
  severity: z.enum(['error', 'warning']),
  message: z.string().min(1),
  ply: z.number().int().positive().nullable(),
  pieceId: z.string().min(1).nullable(),
  excerpt: z.string().min(1).nullable(),
});

export const storyValidationResultSchema = z.object({
  findings: z.array(validationFindingSchema),
  scenePatches: z.array(
    z.object({
      ply: z.number().int().positive(),
      fantasyNarration: z.string().min(1),
    }),
  ),
  epiloguePatch: z.string().min(1).nullable(),
  laterEpilogueHeadingPatch: z.string().min(1).max(80).nullable(),
  laterEpiloguePatch: z.string().min(1).nullable(),
});

export type ValidationFinding = z.infer<typeof validationFindingSchema>;
export type StoryValidationResult = z.infer<typeof storyValidationResultSchema>;
