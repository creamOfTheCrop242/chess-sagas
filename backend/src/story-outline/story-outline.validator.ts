import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from './models/story-outline';
import { isSpoilerFreeBattleTitle } from './story-title';

@Injectable()
export class StoryOutlineValidator {
  validate(
    outline: StoryOutline,
    ledger: GameLedger,
    analysis: NarrativeAnalysis,
  ): void {
    const finalPly = ledger.events.length;
    const pieceIds = new Set(ledger.pieces.map((piece) => piece.id));
    const errors: string[] = [];
    let nextPly = 1;
    const representedEvents = new Set<number>();
    if (!isSpoilerFreeBattleTitle(outline.selectedTitle)) {
      errors.push(
        'Selected title must be a spoiler-free battle name without outcomes or board squares',
      );
    }
    if (
      JSON.stringify(outline.battlefieldEnvironment) !==
      JSON.stringify(analysis.battlefieldEnvironment)
    ) {
      errors.push('Outline battlefield environment must match analysis');
    }

    if (outline.acts.length !== analysis.acts.length) {
      errors.push('Outline acts must match the narrative analysis');
    }

    outline.acts.forEach((act, index) => {
      const plannedAct = analysis.acts[index];
      if (
        !plannedAct ||
        act.startPly !== plannedAct.startPly ||
        act.endPly !== plannedAct.endPly
      ) {
        errors.push('Outline act boundaries must match analysis');
      }
      act.scenes.forEach((scene) => {
        if (
          scene.startPly !== nextPly ||
          scene.endPly < scene.startPly ||
          scene.endPly > act.endPly
        ) {
          errors.push('Scene ply ranges must be chronological and contiguous');
        }
        nextPly = scene.endPly + 1;
        scene.requiredEventPlies.forEach((ply) => {
          if (ply < scene.startPly || ply > scene.endPly) {
            errors.push('Required event ply must fall inside its scene');
          }
          representedEvents.add(ply);
        });
        scene.characters.forEach((pieceId) => {
          if (!pieceIds.has(pieceId)) {
            errors.push(`Unknown piece ID: ${pieceId}`);
          }
        });
      });
      if (nextPly !== act.endPly + 1) {
        errors.push('Scenes must cover their complete act');
      }
    });
    if (nextPly !== finalPly + 1) {
      errors.push(`Scenes must cover every ply from 1-${finalPly}`);
    }

    const significantPlies = ledger.events
      .filter(
        (event) =>
          event.isCapture ||
          event.isCheck ||
          event.isCastle ||
          event.isPromotion,
      )
      .map((event) => event.ply);
    significantPlies.forEach((ply) => {
      if (!representedEvents.has(ply)) {
        errors.push(`Significant event at ply ${ply} is missing`);
      }
    });

    outline.setupPayoffs.forEach((relationship) => {
      if (
        relationship.payoffPly > finalPly ||
        relationship.setupPlies.some(
          (ply) => ply < 1 || ply >= relationship.payoffPly,
        )
      ) {
        errors.push(`Invalid setup/payoff relationship ${relationship.id}`);
      }
    });
    const plannedRelationships = new Map(
      (analysis.relationshipPlans ?? []).map((relationship) => [
        relationship.id,
        relationship,
      ]),
    );
    const outlinedRelationships = new Set<string>();
    for (const relationship of outline.relationshipBeats) {
      const planned = plannedRelationships.get(relationship.relationshipId);
      if (!planned) {
        errors.push(`Unknown relationship plan ${relationship.relationshipId}`);
        continue;
      }
      outlinedRelationships.add(relationship.relationshipId);
      if (
        relationship.characterIds.length !== planned.characterIds.length ||
        relationship.characterIds.some(
          (pieceId) => !planned.characterIds.includes(pieceId),
        )
      ) {
        errors.push(
          `Relationship ${relationship.relationshipId} has incorrect characters`,
        );
      }
      if (relationship.beatPlies.some((ply) => ply < 1 || ply > finalPly)) {
        errors.push(
          `Relationship ${relationship.relationshipId} references an invalid ply`,
        );
      }
      for (const ply of relationship.beatPlies) {
        const scene = outline.acts
          .flatMap((act) => act.scenes)
          .find(
            (candidate) => ply >= candidate.startPly && ply <= candidate.endPly,
          );
        if (
          !scene ||
          planned.characterIds.some(
            (pieceId) => !scene.characters.includes(pieceId),
          )
        ) {
          errors.push(
            `Relationship ${relationship.relationshipId} must place both characters in each planned scene`,
          );
          break;
        }
      }
    }
    for (const relationshipId of plannedRelationships.keys()) {
      if (!outlinedRelationships.has(relationshipId)) {
        errors.push(`Relationship plan ${relationshipId} is missing`);
      }
    }
    const selectedRevengeKeys = new Set<string>();
    for (const payoff of outline.selectedRevengePayoffs ?? []) {
      const event = ledger.events.find(
        (candidate) => candidate.ply === payoff.payoffPly,
      );
      const authorized =
        event?.interactionContext?.avengesDeaths?.some(
          (debt) => debt.deathPly === payoff.deathPly,
        ) ?? false;
      const key = `${payoff.deathPly}:${payoff.payoffPly}`;
      if (!authorized) {
        errors.push(
          `Selected revenge payoff ${key} is not authorized by the ledger`,
        );
      }
      if (selectedRevengeKeys.has(key)) {
        errors.push(`Selected revenge payoff ${key} is duplicated`);
      }
      selectedRevengeKeys.add(key);
    }
    const plannedWounds = new Map(
      (analysis.woundPlans ?? []).map((wound) => [
        `${wound.pieceId}:${wound.inflictedAtPly}`,
        wound,
      ]),
    );
    const outlinedWounds = new Set<string>();
    for (const wound of outline.woundBeats ?? []) {
      const key = `${wound.pieceId}:${wound.inflictedAtPly}`;
      const planned = plannedWounds.get(key);
      outlinedWounds.add(key);
      if (
        !planned ||
        wound.injury !== planned.injury ||
        wound.recoveryPly !== planned.recoveryPly ||
        wound.causeType !== planned.causeType ||
        wound.sourcePieceId !== planned.sourcePieceId
      ) {
        errors.push(`Wound beat ${key} must match the narrative analysis`);
      }
      const continuityEnd = wound.recoveryPly ?? finalPly;
      if (
        wound.continuityPlies.some(
          (ply) => ply <= wound.inflictedAtPly || ply > continuityEnd,
        )
      ) {
        errors.push(`Wound beat ${key} has an invalid continuity ply`);
      }
    }
    for (const key of plannedWounds.keys()) {
      if (!outlinedWounds.has(key)) {
        errors.push(`Planned wound ${key} is missing from the outline`);
      }
    }
    if (
      outline.endingSequence.some(
        (beat) => beat.ply < 1 || beat.ply > finalPly,
      ) ||
      !outline.endingSequence.some((beat) => beat.ply === finalPly)
    ) {
      errors.push('Ending sequence must include the final ply');
    }

    if (errors.length) {
      throw new BadGatewayException(
        `Story outline failed validation: ${[...new Set(errors)].join('; ')}`,
      );
    }
  }
}
