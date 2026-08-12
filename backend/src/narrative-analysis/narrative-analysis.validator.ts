import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import { isSurrenderKingFate } from '../chess/models/story-ending';
import type { NarrativeAnalysis } from './models/narrative-analysis';
import { selectRequiredWoundEvents } from './wound-planning';
import { isSpoilerFreeBattleTitle } from '../story-outline/story-title';
import { selectBattlefieldEnvironment } from '../chess/battlefield-environment';
import {
  allowedSurrenderFates,
  classifySurrender,
} from '../chess/surrender-context';

@Injectable()
export class NarrativeAnalysisValidator {
  validate(analysis: NarrativeAnalysis, ledger: GameLedger): void {
    const finalPly = ledger.events.length;
    const pieceIds = new Set(ledger.pieces.map((piece) => piece.id));
    const validPly = (ply: number) => ply >= 1 && ply <= finalPly;
    const errors: string[] = [];
    const expectedEnvironment = selectBattlefieldEnvironment(ledger);
    if (
      analysis.battlefieldEnvironment.id !== expectedEnvironment.id ||
      analysis.battlefieldEnvironment.name !== expectedEnvironment.name ||
      analysis.battlefieldEnvironment.description !==
        expectedEnvironment.description
    ) {
      errors.push('Battlefield environment must match the seeded selection');
    }
    const expectedSurrenderContext = classifySurrender(ledger);
    if (
      JSON.stringify(analysis.surrenderContext) !==
      JSON.stringify(expectedSurrenderContext)
    ) {
      errors.push('Surrender context must match the final board position');
    }
    if (
      analysis.titleConcepts.some((title) => !isSpoilerFreeBattleTitle(title))
    ) {
      errors.push(
        'Title concepts must be spoiler-free battle names without outcomes or board squares',
      );
    }

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
          `Wound for ${wound.pieceId} must be inflicted while that character survives a ledger-confirmed capture`,
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
      if (
        wound.recoveryPly !== null &&
        isPermanentWound([wound.injury, ...wound.lastingEffects].join(' '))
      ) {
        errors.push(
          `Permanent wound for ${wound.pieceId} cannot recover during the final battle`,
        );
      }
      const woundText = [wound.injury, ...wound.lastingEffects].join(' ');
      if (containsForbiddenWoundReference(woundText, ledger)) {
        errors.push(
          `Wound status for ${wound.pieceId} must not contain names, piece IDs, coordinates, or ply references`,
        );
      }
    }
    const woundKeys = new Set(
      (analysis.woundPlans ?? []).map(
        (wound) => `${wound.pieceId}:${wound.inflictedAtPly}`,
      ),
    );
    if (woundKeys.size !== (analysis.woundPlans ?? []).length) {
      errors.push('Wound plans must not contain duplicate character/ply pairs');
    }
    const requiredWoundKeys = new Set(
      selectRequiredWoundEvents(ledger).map(
        (required) => `${required.pieceId}:${required.inflictedAtPly}`,
      ),
    );
    for (const required of selectRequiredWoundEvents(ledger)) {
      const key = `${required.pieceId}:${required.inflictedAtPly}`;
      if (!woundKeys.has(key)) {
        errors.push(
          `Required wound is missing at ply ${required.inflictedAtPly}`,
        );
      }
    }
    for (const key of woundKeys) {
      if (!requiredWoundKeys.has(key)) {
        errors.push(`Wound plan ${key} was not selected by the seeded roll`);
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
      analysis.promotingPawnPlans.map((plan) => [plan.pieceId, plan]),
    );
    for (const [pieceId, ply] of promotionEvents) {
      const plan = plannedPromotions.get(pieceId);
      if (plan?.promotionPly !== ply) {
        errors.push(`Missing or incorrect promotion plan for ${pieceId}`);
      }
      if (!plan?.ascensionSite?.trim()) {
        errors.push(`Missing Ascension Seal site for ${pieceId}`);
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
    const endingFate = analysis.endingPlan.defeatedKingFate;
    if (
      ledger.metadata.termination === 'checkmate' &&
      endingFate !== 'killed-after-checkmate'
    ) {
      errors.push('Checkmate must kill the defeated King');
    } else if (
      ledger.metadata.termination === 'resignation' &&
      !isSurrenderKingFate(endingFate)
    ) {
      errors.push('Resignation must use a supported surrender outcome');
    } else if (
      expectedSurrenderContext &&
      !allowedSurrenderFates(expectedSurrenderContext.judgment).includes(
        endingFate,
      )
    ) {
      errors.push(
        `Surrender outcome must fit a ${expectedSurrenderContext.judgment} surrender`,
      );
    } else if (
      !['checkmate', 'resignation'].includes(ledger.metadata.termination) &&
      endingFate !== 'survives'
    ) {
      errors.push('This termination must leave the defeated King alive');
    }
    if (
      analysis.endingPlan.surrenderAttempt !==
      (ledger.metadata.termination === 'resignation')
    ) {
      errors.push('Surrender attempt must match resignation termination');
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

function isPermanentWound(text: string): boolean {
  return /\b(amput\w*|dismember\w*|sever\w*|missing|torn off|lost (?:an? |the )?(?:arm|hand|leg|foot)|grave|critical|crippl\w*|organ|spine|spinal|skull)\b/i.test(
    text,
  );
}

function containsForbiddenWoundReference(
  text: string,
  ledger: GameLedger,
): boolean {
  if (/\b[wb]-[pnbrqk]-[a-h][1-8]\b|\bply\b|\b[a-h][1-8]\b/i.test(text)) {
    return true;
  }
  const names = ledger.pieces.flatMap((piece) => [
    piece.permanentName,
    piece.characterName,
    piece.viewpointName,
    piece.operatorName,
    piece.companyName,
  ]);
  return names
    .filter((name): name is string => Boolean(name?.trim()))
    .some((name) => {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(?:^|[^A-Za-z])${escaped}(?:$|[^A-Za-z])`, 'i').test(
        text,
      );
    });
}
