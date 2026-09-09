import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import { relationshipAllegiance } from '../chess/allegiance-context';

export function buildRelationshipSceneGuide(
  ledger: GameLedger,
  analysis: NarrativeAnalysis,
  outline: StoryOutline,
) {
  const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
  const scenes = outline.acts.flatMap((act) => act.scenes);
  return outline.relationshipBeats.flatMap((beat) => {
    const plan = analysis.relationshipPlans.find(
      (p) => p.id === beat.relationshipId,
    );
    if (
      !plan ||
      plan.characterIds.length !== 2 ||
      !plan.characterIds.every(
        (id) => beat.characterIds.includes(id) && pieces.has(id),
      )
    )
      return [];
    const plies = [...new Set(beat.beatPlies)]
      .filter(
        (ply) =>
          Number.isInteger(ply) &&
          ply > 0 &&
          ply <= ledger.events.length &&
          plan.characterIds.every(
            (id) => (pieces.get(id)!.capturedAtPly ?? Infinity) >= ply,
          ),
      )
      .sort((a, b) => a - b);
    return plies.flatMap((ply) => {
      const scene = scenes.find((s) => s.startPly <= ply && s.endPly >= ply);
      if (!scene) return [];
      const event = ledger.events[ply - 1];
      const adjacent = event.interactionContext?.adjacentAllyPieceIds ?? [];
      const nearbyAllies =
        plan.characterIds.includes(event.pieceId) &&
        plan.characterIds.every(
          (id) => id === event.pieceId || adjacent.includes(id),
        );
      return [
        {
          ply,
          relationshipId: plan.id,
          allegiance: relationshipAllegiance(ledger, plan.characterIds, ply),
          participants: plan.characterIds.map((id) => ({
            pieceId: id,
            disposition:
              pieces.get(id)!.kingDisposition ??
              pieces.get(id)!.battleDisposition,
          })),
          startingDynamic: plan.startingDynamic,
          earlierInteractionPlies: plies.filter((previous) => previous < ply),
          nearbyAllies,
          sceneDirection: {
            purpose: scene.purpose,
            emotionalBeat: scene.emotionalBeat,
          },
          // Outline notes can contain future events. Never present them as known facts.
          authorOnlyPlan: {
            progression: beat.progression,
            continuityNotes: scene.continuityNotes,
            eventualPayoff: beat.payoff,
            payoffPly: plan.payoffPly,
          },
        },
      ];
    });
  });
}
