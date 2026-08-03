import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import {
  isSurrenderKingFate,
  kingDiesFromFate,
  sealFateForKingFate,
} from '../chess/models/story-ending';
import type { SceneBreakdown } from './models/scene-breakdown';

@Injectable()
export class SceneBreakdownValidator {
  validate(breakdown: SceneBreakdown, ledger: GameLedger): void {
    const errors: string[] = [];
    const pieceIds = new Set(ledger.pieces.map((piece) => piece.id));
    let nextPly = 1;
    let currentAct = 0;
    let expectedSceneNumber = 0;
    const hasKingDeath = Boolean(
      breakdown.defeatedKingDeathDescription?.trim(),
    );
    const termination = ledger.metadata?.termination;
    if (
      (termination === 'checkmate' &&
        breakdown.defeatedKingFate !== 'killed-after-checkmate') ||
      (termination === 'resignation' &&
        !isSurrenderKingFate(breakdown.defeatedKingFate)) ||
      (!['checkmate', 'resignation'].includes(termination) &&
        breakdown.defeatedKingFate !== 'survives')
    ) {
      errors.push('Defeated King fate must match the game termination');
    }
    if (kingDiesFromFate(breakdown.defeatedKingFate) !== hasKingDeath) {
      errors.push('Defeated King death description must match his fate');
    }
    if (
      breakdown.defeatedSealFate !==
      sealFateForKingFate(breakdown.defeatedKingFate)
    ) {
      errors.push('Defeated Royal Seal fate must match the King outcome');
    }
    if (
      (termination === 'checkmate' && !hasKingDeath) ||
      (!['checkmate', 'resignation'].includes(termination) && hasKingDeath)
    ) {
      errors.push(
        'Defeated King death description must match the game termination',
      );
    }
    if (!breakdown.epilogue?.trim() || !breakdown.laterEpilogue?.trim()) {
      errors.push(
        'Scene breakdown must include immediate and later aftermaths',
      );
    }
    if (!breakdown.laterEpilogueHeading?.trim()) {
      errors.push('Later aftermath must have a heading');
    }
    if (breakdown.scenes.length !== ledger.events.length) {
      errors.push('Scene breakdown must contain exactly one scene per ply');
    }
    for (const wound of breakdown.wounds ?? []) {
      const event = ledger.events[wound.inflictedAtPly - 1];
      if (
        !pieceIds.has(wound.pieceId) ||
        !event?.isCapture ||
        event.pieceId !== wound.pieceId
      ) {
        errors.push(
          `Wound for ${wound.pieceId} is not anchored to that survivor's capture`,
        );
      }
      if (
        wound.recoveryPly !== null &&
        (wound.recoveryPly <= wound.inflictedAtPly ||
          wound.recoveryPly > ledger.events.length)
      ) {
        errors.push(`Wound for ${wound.pieceId} has an invalid recovery ply`);
      }
    }
    breakdown.scenes.forEach((scene) => {
      const events = ledger.events.slice(scene.startPly - 1, scene.endPly);
      if (scene.actNumber !== currentAct) {
        if (scene.actNumber !== currentAct + 1) {
          errors.push('Acts must be numbered chronologically');
        }
        currentAct = scene.actNumber;
        expectedSceneNumber = 1;
      } else {
        expectedSceneNumber += 1;
      }
      if (scene.sceneNumber !== expectedSceneNumber) {
        errors.push(
          'Scene numbering must restart and increase within each act',
        );
      }
      if (scene.startPly !== nextPly || scene.endPly < scene.startPly) {
        errors.push('Scene ply ranges must be chronological and contiguous');
      }
      if (scene.startPly !== scene.endPly) {
        errors.push('Each playback scene must cover exactly one ply');
      }
      nextPly = scene.endPly + 1;
      if (
        JSON.stringify(scene.involvedMoves) !==
        JSON.stringify(events.map((event) => event.san))
      )
        errors.push(`Scene ${scene.id} has incorrect involved moves`);
      const deaths = events
        .filter((event) => event.isCapture)
        .map((event) => event.capturedPieceId!);
      if (JSON.stringify(scene.deaths) !== JSON.stringify(deaths))
        errors.push(`Scene ${scene.id} has incorrect deaths`);
      const promotions = events
        .filter((event) => event.isPromotion)
        .map((event) => event.pieceId);
      if (JSON.stringify(scene.promotions) !== JSON.stringify(promotions))
        errors.push(`Scene ${scene.id} has incorrect promotions`);
      [...scene.characters, ...scene.deaths, ...scene.promotions].forEach(
        (id) => {
          if (!pieceIds.has(id)) errors.push(`Unknown piece ID: ${id}`);
        },
      );
    });
    if (nextPly !== ledger.events.length + 1)
      errors.push('Scenes must cover every ledger ply');
    if (errors.length)
      throw new BadGatewayException(
        `Scene breakdown failed validation: ${[...new Set(errors)].join('; ')}`,
      );
  }
}
