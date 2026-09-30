import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GameLedger } from '../chess/models/game-ledger';
import type { MythicArm } from '../chess/mythic-arms';
import {
  fortressLoadout,
  attackCapabilities,
  establishedMythicArm,
  type FortressLoadout,
} from '../chess/equipment-capabilities';
import type { ValidationFinding } from '../story-validation/models/story-validation';
import type { FullStoryRequest } from './full-story.provider';
import type { SceneObligation } from './scene-obligations';
import { groundedExcerpt } from './review-evidence';
import { checkmateChronology } from './checkmate-chronology';

export const SCENE_FACT_CONTRACT_VERSION = 'scene-facts-v4';
export type FactReviewMode = 'off' | 'observe' | 'enforce';
export function factReviewMode(value: string | undefined): FactReviewMode {
  if (value === undefined || value === '') return 'observe';
  if (value === 'off' || value === 'observe' || value === 'enforce')
    return value;
  throw new Error('STORY_FACT_REVIEW_MODE must be off, observe, or enforce');
}

export interface FactScene {
  ply: number;
  fantasyNarration: string;
  characters: string[];
}

export interface SceneFactContract {
  id: string;
  version: typeof SCENE_FACT_CONTRACT_VERSION;
  ply: number;
  facts: Array<{
    id: string;
    ply?: number;
    pieceId: string | null;
    requirement: string;
    requiredReview?: boolean;
    // Unlike requiredReview, unavailable review is still nonblocking in observe
    // mode. Only grounded, attributed contradictions may trigger repair.
    enforceConfirmed?: boolean;
  }>;
  characters: Array<{
    pieceId: string;
    names: string[];
    lifeAtStart: 'alive' | 'dead';
    lifeAtEnd: 'alive' | 'dead';
    assignedArm: Pick<MythicArm, 'id' | 'name' | 'description'> | null;
    abilities: GameLedger['pieces'][number]['pawnAbilityContract'] | null;
    fortressLoadout?: FortressLoadout | null;
    attackCapabilities?: ReturnType<typeof attackCapabilities>;
    enteringWounds: FullStoryRequest['woundTimeline'];
    newWounds: FullStoryRequest['woundTimeline'];
    leavingWounds: FullStoryRequest['woundTimeline'];
    priorInjuryEvidence?: {
      background: string | null;
      earlierWounds: FullStoryRequest['woundTimeline'];
    };
  }>;
}

export function buildSceneFactContracts(
  ledger: GameLedger,
  scenes: FactScene[],
  obligations: SceneObligation[],
  wounds: FullStoryRequest['woundTimeline'],
  deaths: FullStoryRequest['deathContracts'],
  fortressTimeline: FullStoryRequest['fortressOperatingTimeline'],
): SceneFactContract[] {
  return scenes.map((scene) => {
    const event = ledger.events.find((e) => e.ply === scene.ply);
    if (!event) throw new Error(`No ledger event for scene ${scene.ply}`);
    const death = deaths.find((d) => d.ply === scene.ply);
    const relevant = new Set([
      ...scene.characters,
      event.pieceId,
      ...(event.capturedPieceId ? [event.capturedPieceId] : []),
      ...(death?.authorizedDeaths.flatMap((d) =>
        d.authorizedVictimId ? [d.authorizedVictimId] : [],
      ) ?? []),
      ...wounds
        .filter((w) => w.inflictedAtPly === scene.ply)
        .flatMap((w) => [
          w.pieceId,
          ...(w.sourcePieceId ? [w.sourcePieceId] : []),
        ]),
    ]);
    // Do not let an incomplete model-written cast list hide named characters.
    const namesFor = (p: GameLedger['pieces'][number]) => [
      ...new Set(
        [
          p.characterName,
          p.operatorName,
          p.viewpointName,
          p.permanentName,
        ].filter((n): n is string => !!n),
      ),
    ];
    for (const piece of ledger.pieces) {
      if (
        namesFor(piece).some((name) =>
          new RegExp(
            `\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
            'i',
          ).test(scene.fantasyNarration),
        )
      )
        relevant.add(piece.id);
    }
    const characters = ledger.pieces
      .filter((p) => relevant.has(p.id))
      .map((p) => {
        const deathPly =
          deaths.find((d) =>
            d.authorizedDeaths.some((v) => v.authorizedVictimId === p.id),
          )?.ply ?? p.capturedAtPly;
        const owned = wounds.filter((w) => w.pieceId === p.id);
        // Piece identities contain their final type; do not lend a pawn its
        // future promoted equipment or abilities in an earlier scene.
        const promotion = ledger.events.find(
          (e) => e.pieceId === p.id && e.isPromotion,
        );
        const role =
          promotion && promotion.ply > scene.ply ? 'grunt' : p.fantasyType;
        const arm =
          role === 'knight-commander' ? establishedMythicArm(p) : null;
        return {
          pieceId: p.id,
          names: namesFor(p),
          lifeAtStart:
            deathPly !== undefined && deathPly < scene.ply
              ? ('dead' as const)
              : ('alive' as const),
          lifeAtEnd:
            deathPly !== undefined && deathPly <= scene.ply
              ? ('dead' as const)
              : ('alive' as const),
          assignedArm: arm
            ? { id: arm.id, name: arm.name, description: arm.description }
            : null,
          abilities: role === 'grunt' ? (p.pawnAbilityContract ?? null) : null,
          fortressLoadout:
            role === 'moving-fortress' ? fortressLoadout(p) : null,
          attackCapabilities: attackCapabilities(p, role),
          enteringWounds: owned.filter(
            (w) =>
              w.inflictedAtPly < scene.ply &&
              (w.recoveryPly === null || w.recoveryPly >= scene.ply),
          ),
          newWounds: owned.filter((w) => w.inflictedAtPly === scene.ply),
          leavingWounds: owned.filter(
            (w) =>
              w.inflictedAtPly <= scene.ply &&
              (w.recoveryPly === null || w.recoveryPly > scene.ply),
          ),
          ...(event.isCapture && event.capturedPieceId === p.id
            ? {
                priorInjuryEvidence: {
                  background: p.backstory ?? null,
                  // Include healed injuries: a genuine old scar is not an
                  // invented active wound. Never lend a future injury backward.
                  earlierWounds: owned.filter(
                    (w) => w.inflictedAtPly < scene.ply,
                  ),
                },
              }
            : {}),
        };
      });
    const facts: SceneFactContract['facts'] = obligations
      .filter((o) => o.ply === scene.ply)
      .map((o) => ({
        ...o,
        pieceId: null as string | null,
      }));
    if (event.isCheckmate) {
      if (
        !death?.authorizedDeaths.some(
          (d) =>
            d.eventKind === 'checkmate' &&
            d.authorizedVictimId &&
            d.authorizedVictimId === event.checkmateExplanation?.kingId &&
            d.decisiveActorId === event.pieceId,
        )
      ) {
        throw new Error(
          `Incomplete checkmate death contract at ply ${scene.ply}`,
        );
      }
      // Each authorized death needs its own verdict. A captured defender's
      // death cannot stand in for the king, nor can an ally replace the mover.
      for (const victim of death?.authorizedDeaths ?? []) {
        const id = `${scene.ply}:death:${victim.authorizedVictimId}`;
        const fact = facts.find((f) => f.id === id);
        const requirement =
          `Verify this death independently in the TARGET prose: ${JSON.stringify(victim)}. The named victim must die visibly from the decisive actor's attack, with how the attack killed this victim explained. Another character's death, mere encirclement, or a future threat does not satisfy this requirement. Resolve the actor and victim from the entire scene; uncertain identity is not a confirmed contradiction. ${checkmateChronology(ledger, victim)}`.trim();
        if (fact)
          Object.assign(fact, {
            requirement,
            pieceId: victim.authorizedVictimId,
            requiredReview: true,
          });
        else
          facts.push({
            id,
            requirement,
            pieceId: victim.authorizedVictimId,
            requiredReview: true,
          });
      }
    }
    facts.push({
      id: `${scene.ply}:life`,
      ply: scene.ply,
      pieceId: null,
      requirement: `Exactly these deaths are authorized now: ${JSON.stringify(death?.authorizedDeaths ?? [])}. ${event.isCheckmate && event.isCapture ? 'This capturing checkmate requires BOTH the captured character and the checkmated King to die. ' : event.isCheck && !event.isCheckmate ? 'This is an ordinary check, not checkmate; the checked King remains alive. ' : ''}No other character may die. Already-dead characters may be remembered, not newly killed or active as living fighters.`,
    });
    for (const character of characters) {
      if (character.priorInjuryEvidence) {
        facts.push({
          id: `${scene.ply}:prior-injury:${character.pieceId}`,
          ply: scene.ply,
          pieceId: character.pieceId,
          enforceConfirmed: true,
          requirement:
            "Check ONLY claims that this capture victim already had a bodily injury before the current fatal encounter. Death permission allows fresh lethal damage, not an invented injury history. Compare explicit prior-injury claims with priorInjuryEvidence (background and earlier wounds, including healed ones) and enteringWounds. A current assault may create a cut and then deepen that same fresh cut; that is not a pre-existing battle wound. New fatal injuries need no wound-plan entry. An old healed scar or a remembered, hypothetical, negated, or another person's injury is not proof of an unsupported active wound. Resolve the owner and timing from the whole scene and context, not adjacent names or keywords. Report a contradiction only when a quoted passage unambiguously assigns an unsupported earlier injury to this victim; otherwise use uncertain. No prior-injury mention is required. If repair is needed, remove the unsupported history while preserving the authorized attacker, death, and method; do not invent an earlier injury or change another scene to justify it.",
        });
      }
      facts.push({
        id: `${scene.ply}:state:${character.pieceId}`,
        ply: scene.ply,
        pieceId: character.pieceId,
        requirement:
          "Compare prose ownership and timing with this character's entering/new/leaving wounds and life state. Existing wounds need not be mentioned in every scene. A required new wound must be caused to its owner by its contracted source before its effects. Fatal harm to an authorized capture victim is allowed, but does not fulfill another character's required wound. Do not mistake danger, negation, terrain damage, or striking an enemy for an injury to this character.",
      });
      if (character.assignedArm || character.fortressLoadout)
        facts.push({
          id: `${scene.ply}:equipment:${character.pieceId}`,
          ply: scene.ply,
          pieceId: character.pieceId,
          requirement:
            'Weapons, attachments and attacks must match assignedArm or fortressLoadout and attackCapabilities. No unlisted weapon systems or effects (e.g. force storage is not fire). Ordinary paraphrases and singular references still refer to the same weapon. Being struck by an enemy weapon is not ownership. No weapon mention is required. Null equipment/capabilities means unknown legacy data, not proof of a contradiction.',
        });
      const fortress = fortressTimeline.find(
        (f) => f.pieceId === character.pieceId,
      );
      if (fortress)
        facts.push({
          id: `${scene.ply}:power:${character.pieceId}`,
          ply: scene.ply,
          pieceId: character.pieceId,
          requirement: `Fortress operating permission: ${JSON.stringify(fortress)}. Damage to its integrated machinery affects the pilot; attacks fired from it need not damage it. Battle-ending Seal shutdown is not an invented physical wound.`,
        });
    }
    return {
      id: `scene:${scene.ply}`,
      version: SCENE_FACT_CONTRACT_VERSION,
      ply: scene.ply,
      facts,
      characters,
    };
  });
}

export const sceneFactReviewSchema = z.object({
  assessments: z.array(
    z.object({
      contractId: z.string(),
      checkedFactIds: z.array(z.string()),
      issues: z.array(
        z.object({
          factId: z.string(),
          status: z.enum(['contradiction', 'omitted', 'uncertain']),
          confidence: z.enum(['high', 'medium', 'low']),
          actorId: z.string().nullable(),
          affectedPieceId: z.string().nullable(),
          excerpt: z.string().nullable(),
          reason: z.string(),
        }),
      ),
    }),
  ),
});
export type SceneFactReview = z.infer<typeof sceneFactReviewSchema>;

export function sceneFactFindings(
  contracts: SceneFactContract[],
  scenes: FactScene[],
  review: SceneFactReview,
): ValidationFinding[] {
  const expectedIds = new Set(contracts.map((c) => c.id));
  if (
    review.assessments.length !== expectedIds.size ||
    new Set(review.assessments.map((a) => a.contractId)).size !==
      expectedIds.size ||
    review.assessments.some((a) => !expectedIds.has(a.contractId))
  )
    throw new Error('Incomplete scene fact review coverage');
  return review.assessments.flatMap((assessment) => {
    const contract = contracts.find((c) => c.id === assessment.contractId)!;
    const factIds = new Set(contract.facts.map((f) => f.id));
    if (
      assessment.checkedFactIds.length !== factIds.size ||
      new Set(assessment.checkedFactIds).size !== factIds.size ||
      assessment.checkedFactIds.some((id) => !factIds.has(id))
    )
      throw new Error(`Incomplete fact coverage for ${contract.id}`);
    const prose =
      scenes.find((s) => s.ply === contract.ply)?.fantasyNarration ?? '';
    const pieceIds = new Set(contract.characters.map((c) => c.pieceId));
    return assessment.issues.map((issue) => {
      const fact = contract.facts.find((f) => f.id === issue.factId);
      if (
        !fact ||
        [issue.actorId, issue.affectedPieceId].some(
          (id) => id !== null && !pieceIds.has(id),
        )
      )
        throw new Error(`Invalid factual attribution for ${contract.id}`);
      const excerpt = groundedExcerpt(prose, issue.excerpt);
      const grounded = excerpt !== null;
      return {
        factId: fact.id,
        type: 'outline-continuity' as const,
        severity:
          grounded &&
          issue.confidence === 'high' &&
          (!(fact.requiredReview || fact.enforceConfirmed) ||
            issue.affectedPieceId === fact.pieceId) &&
          (!fact.enforceConfirmed || issue.status === 'contradiction') &&
          issue.status !== 'uncertain'
            ? ('error' as const)
            : ('warning' as const),
        ply: contract.ply,
        pieceId: fact.pieceId ?? issue.affectedPieceId,
        excerpt,
        message: `Scene fact ${fact.id}: ${issue.reason}. Required: ${fact.requirement}`,
      };
    });
  });
}

export function sceneFactHash(
  contract: SceneFactContract,
  scene: FactScene,
  context: FactScene[],
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({ contract, prose: scene.fantasyNarration, context }),
    )
    .digest('hex');
}

/** In enforcement mode, prose ownership heuristics nominate candidates;
 * the grounded scene review decides them. Structural metadata errors and
 * directly named fatal contradictions retain their deterministic checks. */
export function combineSceneFindings(
  mode: FactReviewMode,
  deterministic: ValidationFinding[],
  semantic: ValidationFinding[],
): ValidationFinding[] {
  const attributionTypes = new Set([
    'invented-wound',
    'wound-continuity',
    'mythic-arm-ownership',
    'wrong-captor',
  ]);
  return [
    ...deterministic.map((finding) =>
      (finding.type === 'missing-checkmate' || mode === 'enforce') &&
      finding.excerpt &&
      (finding.type === 'missing-checkmate' ||
        attributionTypes.has(finding.type))
        ? {
            ...finding,
            severity: 'warning' as const,
            message: `[Prose candidate reviewed] ${finding.message}`,
          }
        : finding,
    ),
    ...semantic,
  ];
}
