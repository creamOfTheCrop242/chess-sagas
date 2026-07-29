import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from './models/narrative-analysis';

@Injectable()
export class NarrativeAnalysisValidator {
  validate(analysis: NarrativeAnalysis, ledger: GameLedger): void {
    const finalPly = ledger.events.length;
    const pieceIds = new Set(ledger.pieces.map((piece) => piece.id));
    const validPly = (ply: number) => ply >= 1 && ply <= finalPly;
    const errors: string[] = [];

    const referencedPieceIds = [
      ...analysis.characterImportance.map((item) => item.pieceId),
      ...analysis.characterArcs.map((item) => item.pieceId),
      ...analysis.acts.flatMap((act) => act.majorCharacters),
      ...analysis.promotingPawnPlans.map((plan) => plan.pieceId),
      ...analysis.relationshipPlans.flatMap((plan) => plan.characterIds),
      ...(analysis.woundPlans ?? []).map((plan) => plan.pieceId),
    ];
    for (const pieceId of referencedPieceIds) {
      if (!pieceIds.has(pieceId)) {
        errors.push(`Unknown piece ID: ${pieceId}`);
      }
    }

    const referencedPlies = [
      ...analysis.majorTurningPoints.flatMap((point) => [
        point.startPly,
        point.endPly,
      ]),
      ...analysis.characterArcs.flatMap((arc) => [
        arc.introductionPly,
        ...arc.keyMoments,
        ...(arc.endingPly === null ? [] : [arc.endingPly]),
      ]),
      ...analysis.promotingPawnPlans.flatMap((plan) => [
        plan.promotionPly,
        ...plan.setupPlies,
      ]),
      ...analysis.foreshadowing.flatMap((plan) => [
        plan.payoffPly,
        ...plan.setupPlies,
      ]),
      ...analysis.relationshipPlans.flatMap((plan) => [
        ...plan.developmentPlies,
        ...(plan.payoffPly === null ? [] : [plan.payoffPly]),
      ]),
      ...(analysis.woundPlans ?? []).flatMap((plan) => [
        plan.inflictedAtPly,
        ...(plan.recoveryPly === null ? [] : [plan.recoveryPly]),
      ]),
    ];
    if (referencedPlies.some((ply) => !validPly(ply))) {
      errors.push(`Analysis references a ply outside 1-${finalPly}`);
    }
    const relationshipIds = new Set<string>();
    for (const relationship of analysis.relationshipPlans) {
      if (relationshipIds.has(relationship.id)) {
        errors.push(`Duplicate relationship ID: ${relationship.id}`);
      }
      relationshipIds.add(relationship.id);
      if (relationship.characterIds[0] === relationship.characterIds[1]) {
        errors.push(
          `Relationship ${relationship.id} must involve two characters`,
        );
      }
      if (
        relationship.payoffPly !== null &&
        relationship.developmentPlies.some(
          (ply) => ply > relationship.payoffPly!,
        )
      ) {
        errors.push(
          `Relationship ${relationship.id} develops after its payoff`,
        );
      }
    }

    for (const wound of analysis.woundPlans ?? []) {
      const event = ledger.events[wound.inflictedAtPly - 1];
      if (!event?.isCapture || event.pieceId !== wound.pieceId) {
        errors.push(
          `Wound for ${wound.pieceId} must be inflicted while that survivor makes a ledger-confirmed capture`,
        );
      }
      if (
        wound.recoveryPly !== null &&
        wound.recoveryPly <= wound.inflictedAtPly
      ) {
        errors.push(
          `Wound recovery for ${wound.pieceId} must follow its infliction`,
        );
      }
    }

    let nextActPly = 1;
    for (const act of analysis.acts) {
      if (act.startPly !== nextActPly || act.endPly < act.startPly) {
        errors.push(
          'Acts must be chronological, non-overlapping, and contiguous',
        );
        break;
      }
      nextActPly = act.endPly + 1;
    }
    if (nextActPly !== finalPly + 1) {
      errors.push(`Acts must cover every ply from 1-${finalPly}`);
    }

    const promotionEvents = new Map(
      ledger.events
        .filter((event) => event.isPromotion)
        .map((event) => [event.pieceId, event.ply]),
    );
    const plannedPromotions = new Map(
      analysis.promotingPawnPlans.map((plan) => [
        plan.pieceId,
        plan.promotionPly,
      ]),
    );
    for (const [pieceId, ply] of promotionEvents) {
      if (plannedPromotions.get(pieceId) !== ply) {
        errors.push(`Missing or incorrect promotion plan for ${pieceId}`);
      }
    }
    for (const pieceId of plannedPromotions.keys()) {
      if (!promotionEvents.has(pieceId)) {
        errors.push(`Invented promotion plan for ${pieceId}`);
      }
    }

    const expectedWinner =
      ledger.metadata.result === '1-0'
        ? 'north'
        : ledger.metadata.result === '0-1'
          ? 'south'
          : ledger.metadata.result === '1/2-1/2'
            ? 'draw'
            : 'undecided';
    if (analysis.endingPlan.winner !== expectedWinner) {
      errors.push(`Ending winner must be ${expectedWinner}`);
    }
    if (analysis.endingPlan.termination !== ledger.metadata.termination) {
      errors.push(`Ending termination must be ${ledger.metadata.termination}`);
    }

    if (errors.length > 0) {
      throw new BadGatewayException(
        `Narrative analysis failed ledger validation: ${[
          ...new Set(errors),
        ].join('; ')}`,
      );
    }
  }
}
