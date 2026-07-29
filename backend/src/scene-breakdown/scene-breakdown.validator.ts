import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { SceneBreakdown } from './models/scene-breakdown';

@Injectable()
export class SceneBreakdownValidator {
  validate(breakdown: SceneBreakdown, ledger: GameLedger): void {
    const errors: string[] = [];
    const pieceIds = new Set(ledger.pieces.map((piece) => piece.id));
    let nextPly = 1;
    let currentAct = 0;
    let expectedSceneNumber = 0;
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
