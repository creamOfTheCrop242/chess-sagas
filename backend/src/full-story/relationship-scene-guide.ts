import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from '../story-outline/models/story-outline';
import { relationshipAllegiance } from '../chess/allegiance-context';
import {
  buildCharacterEventContext,
  characterEventRole,
} from '../chess/character-event-context';

/** Optional author intentions: invalid references are dropped, never repaired. */
export function buildCharacterThreadGuide(
  ledger: GameLedger,
  outline: StoryOutline,
) {
  const seen = new Set<string>();
  const events = new Map(
    buildCharacterEventContext(ledger).map((event) => [event.ply, event]),
  );
  return (outline.characterThreads ?? [])
    .flatMap((thread) => {
      const piece = ledger.pieces.find((p) => p.id === thread.pieceId);
      if (!piece || seen.has(piece.id)) return [];
      seen.add(piece.id);
      const moments = thread.moments
        .filter(
          (moment) =>
            ledger.events.some((e) => e.ply === moment.ply) &&
            moment.ply <= (piece.capturedAtPly ?? Infinity) &&
            outline.acts.some((act) =>
              act.scenes.some(
                (scene) =>
                  scene.startPly <= moment.ply &&
                  scene.endPly >= moment.ply &&
                  scene.characters.includes(piece.id),
              ),
            ),
        )
        .sort((a, b) => a.ply - b.ply)
        .map((moment) => {
          const event = events.get(moment.ply)!;
          const earlier = moment.respondsToPly
            ? events.get(moment.respondsToPly)
            : undefined;
          const validEarlier =
            earlier &&
            earlier.ply < moment.ply &&
            characterEventRole(earlier, piece.id) !==
              'no-established-direct-involvement';
          return {
            ...moment,
            respondsToPly: validEarlier ? earlier.ply : null,
            eventFacts: {
              ...event,
              characterRole: characterEventRole(event, piece.id),
            },
            earlierEventFacts: validEarlier
              ? {
                  ...earlier,
                  characterRole: characterEventRole(earlier, piece.id),
                }
              : null,
          };
        });
      return [
        {
          ...thread,
          endingSetupPly: moments.some((m) => m.ply === thread.endingSetupPly)
            ? thread.endingSetupPly
            : null,
          moments: moments.filter(
            (m, i) => i === 0 || moments[i - 1].ply !== m.ply,
          ),
        },
      ];
    })
    .slice(0, 3);
}

export function buildCharacterRepairGuide(
  ledger: GameLedger,
  outline: StoryOutline,
  plies: number[],
) {
  return buildCharacterThreadGuide(ledger, outline).flatMap((thread) =>
    thread.moments
      .filter((m) => plies.includes(m.ply))
      .map((moment) => ({
        pieceId: thread.pieceId,
        personalWant: thread.personalWant,
        personalStake: thread.personalStake,
        initialBehavior: thread.initialBehavior,
        authorOnlyMoment: moment,
        earlierMomentPlies: [
          ...new Set([
            ...thread.moments
              .filter((m) => m.ply < moment.ply)
              .map((m) => m.ply),
            ...(moment.respondsToPly ? [moment.respondsToPly] : []),
          ]),
        ].sort((a, b) => a - b),
      })),
  );
}

/** Bounded real prose, separate from author intentions. Never supplies future scenes. */
export function buildCharacterRepairContext(
  ledger: GameLedger,
  outline: StoryOutline,
  plies: number[],
  scenes: Array<{ startPly: number; fantasyNarration: string }>,
) {
  const targets = new Set(plies);
  return buildCharacterRepairGuide(ledger, outline, plies)
    .map((intent) => ({
      forPly: intent.authorOnlyMoment.ply,
      pieceId: intent.pieceId,
      earlierScenes: intent.earlierMomentPlies
        .filter((ply) => !targets.has(ply))
        .slice(-2)
        .flatMap((ply) => {
          const scene = scenes.find((s) => s.startPly === ply);
          return scene
            ? [
                {
                  ply,
                  text: scene.fantasyNarration.slice(0, 2000),
                  truncated: scene.fantasyNarration.length > 2000,
                },
              ]
            : [];
        }),
    }))
    .slice(0, 6);
}

/** A compact index, not invented character memory or another event contract. */
export function buildQuietSceneGuide(
  ledger: GameLedger,
  outline: StoryOutline,
) {
  const scenes = outline.acts.flatMap((act) => act.scenes);
  const threads = buildCharacterThreadGuide(ledger, outline);
  const previousMoves = new Map<string, number>();
  return ledger.events.flatMap((event) => {
    const previousMovePly = previousMoves.get(event.pieceId) ?? null;
    previousMoves.set(event.pieceId, event.ply);
    if (!event.isQuietMove) return [];
    const scene = scenes.find(
      (s) => s.startPly <= event.ply && s.endPly >= event.ply,
    );
    if (!scene) return [];
    const previousScene = scenes
      .filter(
        (s) => s.endPly < event.ply && s.characters.includes(event.pieceId),
      )
      .sort((a, b) => b.endPly - a.endPly)[0];
    const characterFocus = threads.flatMap((thread) => {
      const moment = thread.moments.find((m) => m.ply === event.ply);
      if (!moment) return [];
      const previousMoment = thread.moments
        .filter((m) => m.ply < event.ply)
        .at(-1);
      return [
        {
          pieceId: thread.pieceId,
          personalWant: thread.personalWant,
          personalStake: thread.personalStake,
          initialBehavior: thread.initialBehavior,
          currentMoment: moment,
          previousMoment: previousMoment ?? null,
        },
      ];
    });
    return [
      {
        ply: event.ply,
        pieceId: event.pieceId,
        treatment:
          outline.relationshipBeats.some(
            (b) =>
              b.beatPlies.includes(event.ply) &&
              b.characterIds.includes(event.pieceId),
          ) || characterFocus.length > 0
            ? 'featured-character-beat'
            : 'brief-connection',
        previousMovePly,
        previousSceneEndPly: previousScene?.endPly ?? null,
        // These are author intentions, never proof of what has already happened.
        authorOnlyDirection: {
          characterFocus,
          previousEmotionalBeat: previousScene?.emotionalBeat ?? null,
          currentEmotionalBeat: scene.emotionalBeat,
        },
      },
    ];
  });
}

export function buildEndingActionGuide(
  ledger: GameLedger,
  outline: StoryOutline,
) {
  const plan = outline.endingActionPlan;
  if (!plan) return null;
  const ids = new Set(ledger.pieces.map((p) => p.id));
  // Unusable optional guidance falls back to the ordinary ending sequence.
  return [plan.aftermath, plan.laterChronicle].every(
    (section) =>
      ids.has(section.viewpointPieceId) &&
      section.finalPositions.every((p) => ids.has(p.pieceId)),
  )
    ? plan
    : null;
}

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
