import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from '../narrative-analysis/models/narrative-analysis';
import type { StoryOutline } from './models/story-outline';

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
