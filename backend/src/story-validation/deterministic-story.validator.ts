import { Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { GeneratedStoryPackage } from '../full-story/models/generated-story';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { ValidationFinding } from './models/story-validation';
import {
  mentionsIncompatibleWeaponKind,
  mentionedMythicArms,
  mythicArmForCommander,
} from '../chess/mythic-arms';

export interface DeterministicSceneInput {
  ply: number;
  fantasyNarration: string;
  characters: string[];
  woundsInflicted?: Array<{ pieceId: string; inflictedAtPly: number }>;
  woundReferences?: Array<{ woundId: string; ownerPieceId: string }>;
}

export interface ScenePackageValidation {
  terminologyFindings: ValidationFinding[];
  timedFateFindings: ValidationFinding[];
  captureAttributionFindings: ValidationFinding[];
  checkStrainFindings: ValidationFinding[];
  revengePayoffFindings: ValidationFinding[];
  prematureAscensionFindings: ValidationFinding[];
  checkmateDeathFindings: ValidationFinding[];
  fortressPowerFindings: ValidationFinding[];
  mythicArmFindings: ValidationFinding[];
  woundFindings: ValidationFinding[];
  findings: ValidationFinding[];
}

@Injectable()
export class DeterministicStoryValidator {
  /**
   * Canonical deterministic scene validation. Every caller that accepts or
   * repairs scene prose should use this method so a repair cannot accidentally
   * skip a validator that ran during initial generation.
   */
  validateScenePackage(
    scenes: DeterministicSceneInput[],
    ledger: GameLedger,
    wounds: GeneratedStoryPackage['wounds'] = [],
    selectedRevengePayoffs: StoryOutline['selectedRevengePayoffs'] = [],
  ): ScenePackageValidation {
    const proseScenes = scenes.map(({ ply, fantasyNarration }) => ({
      ply,
      fantasyNarration,
    }));
    const terminologyFindings = this.validateSceneTerminology(proseScenes);
    const timedFateFindings = this.validateTimedCharacterFates(
      proseScenes,
      ledger,
    );
    const captureAttributionFindings = this.validateCaptureAttribution(
      proseScenes,
      ledger,
    );
    const checkStrainFindings = this.validateCheckStrainOwnership(
      proseScenes,
      ledger,
    );
    const revengePayoffFindings = this.validateRevengePayoffs(
      proseScenes,
      ledger,
      selectedRevengePayoffs,
    );
    const prematureAscensionFindings = this.validatePrematureAscensionReveals(
      proseScenes,
      ledger,
    );
    const checkmateDeathFindings = this.validateCheckmateKingDeath(
      proseScenes,
      ledger,
    );
    const fortressPowerFindings = this.validatePrematureFortressPowerLoss(
      scenes,
      ledger,
    );
    const mythicArmFindings = this.validateMythicArmOwnership(scenes, ledger);
    const hasStructuredWoundMetadata = scenes.every(
      (scene) =>
        scene.woundsInflicted !== undefined &&
        scene.woundReferences !== undefined,
    );
    const woundFindings = [
      ...(hasStructuredWoundMetadata
        ? this.validateStructuredWoundReferences(scenes, wounds)
        : []),
      ...this.validateTimedWounds(
        scenes,
        wounds,
        ledger,
        hasStructuredWoundMetadata,
      ),
      ...this.validateUnplannedInjuries(scenes, wounds, ledger),
      ...this.validateWoundOwnershipTransfers(scenes, wounds, ledger),
    ];
    const findings = [
      ...terminologyFindings,
      ...prematureAscensionFindings,
      ...captureAttributionFindings,
      ...checkStrainFindings,
      ...revengePayoffFindings,
      ...timedFateFindings,
      ...checkmateDeathFindings,
      ...fortressPowerFindings,
      ...mythicArmFindings,
      ...woundFindings,
    ];
    return {
      terminologyFindings,
      timedFateFindings,
      captureAttributionFindings,
      checkStrainFindings,
      revengePayoffFindings,
      prematureAscensionFindings,
      checkmateDeathFindings,
      fortressPowerFindings,
      mythicArmFindings,
      woundFindings,
      findings,
    };
  }

  validateMythicArmOwnership(
    scenes: Array<{
      ply: number;
      fantasyNarration: string;
      characters: string[];
    }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const commanders = ledger.pieces.filter(
      (piece) => piece.fantasyType === 'knight-commander',
    );
    const findings: ValidationFinding[] = [];

    for (const scene of scenes) {
      const sentences = scene.fantasyNarration.match(/[^.!?]+[.!?]?/g) ?? [
        scene.fantasyNarration,
      ];
      for (const commander of commanders) {
        if (!scene.characters.includes(commander.id)) continue;
        const assignedArm = mythicArmForCommander(commander, ledger.initialFen);
        const aliases = characterAliases(commander);
        const conflictingSentence = sentences.find(
          (sentence) =>
            mentionsCharacter(sentence, aliases) &&
            mentionedMythicArms(sentence).some(
              (arm) => arm.id !== assignedArm.id,
            ),
        );
        if (!conflictingSentence) continue;
        findings.push({
          type: 'mythic-arm-ownership',
          severity: 'error',
          message: `${commander.permanentName} is attributed another Knight Commander's Mythic Arm; the assigned weapon is ${assignedArm.name}`,
          ply: scene.ply,
          pieceId: commander.id,
          excerpt: conflictingSentence.trim().slice(0, 300),
        });
      }
    }

    return findings;
  }

  validatePrematureFortressPowerLoss(
    scenes: Array<{
      ply: number;
      fantasyNarration: string;
      characters: string[];
    }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const fortresses = ledger.pieces.filter(
      (piece) => piece.fantasyType === 'moving-fortress',
    );
    const findings: ValidationFinding[] = [];

    for (const scene of scenes) {
      for (const fortress of fortresses) {
        if (
          fortress.capturedAtPly !== undefined &&
          scene.ply >= fortress.capturedAtPly
        ) {
          continue;
        }
        if (!scene.characters.includes(fortress.id)) continue;
        const excerpt = prematureFortressPowerLossExcerpt(
          scene.fantasyNarration,
          characterAliases(fortress),
        );
        if (!excerpt) continue;
        findings.push({
          type: 'fortress-power-state',
          severity: 'error',
          message: `${fortress.permanentName} is still powered by its living King's Royal Seal at ply ${scene.ply}; power loss may occur only after that King dies`,
          ply: scene.ply,
          pieceId: fortress.id,
          excerpt,
        });
      }
    }

    return findings;
  }

  repairProhibitedTerminology(storyMarkdown: string): string {
    return storyMarkdown
      .replace(/\bcheckmate\b/gi, 'final defeat')
      .replace(/\bchess\b/gi, 'war')
      .replace(/\bSAN\b/g, 'battle record')
      .replace(/\bFEN\b/g, 'battle formation')
      .replace(/\bplies\b/gi, 'turns')
      .replace(/\bply\b/gi, 'turn')
      .replace(/\b[A-H]-file\b/gi, 'battlefront')
      .replace(/\bfile company\b/gi, 'soldier company');
  }

  validate(storyMarkdown: string, ledger: GameLedger): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    const add = (
      type: ValidationFinding['type'],
      message: string,
      excerpt: string,
    ) =>
      findings.push({
        type,
        severity: 'error',
        message,
        ply: null,
        pieceId: null,
        excerpt,
      });

    const coordinate = storyMarkdown.match(/\b[a-h][1-8]\b/i)?.[0];
    if (coordinate) {
      add(
        'coordinate-mentioned-in-prose',
        'Reader-facing prose contains a board coordinate',
        coordinate,
      );
    }
    const chessTerm = storyMarkdown.match(
      /\b(?:chess|checkmate|SAN|FEN|ply|plies|[A-H]-file|file company)\b/i,
    )?.[0];
    if (chessTerm) {
      add(
        'chess-terminology',
        'Reader-facing prose contains chess-derived terminology',
        chessTerm,
      );
    }
    const leakedPiece = ledger.pieces.find((piece) =>
      storyMarkdown.includes(piece.id),
    );
    if (leakedPiece) {
      findings.push({
        type: 'inconsistent-piece-name',
        severity: 'error',
        message: 'Reader-facing prose exposes an internal piece ID',
        ply: null,
        pieceId: leakedPiece.id,
        excerpt: leakedPiece.id,
      });
    }
    return findings;
  }

  validateSceneTerminology(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
  ): ValidationFinding[] {
    return scenes.flatMap((scene) => {
      const coordinate = scene.fantasyNarration.match(/\b[a-h][1-8]\b/i)?.[0];
      if (!coordinate) return [];
      return [
        {
          type: 'coordinate-mentioned-in-prose' as const,
          severity: 'error' as const,
          message:
            'Reader-facing scene contains a board coordinate; rewrite the scene using characters and battlefield constraints without listing squares',
          ply: scene.ply,
          pieceId: null,
          excerpt: coordinate,
        },
      ];
    });
  }

  validateTimedCharacterFates(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    const checkmateEvent =
      ledger.metadata?.termination === 'checkmate'
        ? ledger.events?.find((event) => event.isCheckmate)
        : undefined;
    for (const scene of scenes) {
      for (const piece of ledger.pieces) {
        const isAuthorizedCheckmateDeath =
          checkmateEvent?.ply === scene.ply &&
          checkmateEvent.checkmateExplanation?.kingId === piece.id;
        if (isAuthorizedCheckmateDeath) continue;
        if (
          piece.capturedAtPly !== undefined &&
          piece.capturedAtPly <= scene.ply
        ) {
          continue;
        }
        const names = [
          piece.permanentName,
          piece.characterName,
          piece.viewpointName,
          piece.operatorName,
        ].filter(
          (name, index, all): name is string =>
            Boolean(name) && all.indexOf(name) === index,
        );
        const excerpt = names
          .map((name) => prematureDeathExcerpt(scene.fantasyNarration, name))
          .find((match): match is string => Boolean(match));
        const resolvedExcerpt =
          excerpt ??
          localPronounDeathExcerpt(scene.fantasyNarration, piece, ledger);
        if (!resolvedExcerpt) continue;
        findings.push({
          type:
            piece.capturedAtPly === undefined
              ? 'survivor-killed'
              : 'invented-capture',
          severity: 'error',
          message:
            piece.capturedAtPly === undefined
              ? `${piece.permanentName} survives the ledger but is described as dead`
              : `${piece.permanentName} is described as dead before capture at ply ${piece.capturedAtPly}`,
          ply: scene.ply,
          pieceId: piece.id,
          excerpt: resolvedExcerpt,
        });
      }
    }
    return findings;
  }

  validatePrematureAscensionReveals(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const promotionPlies = ledger.events
      .filter((event) => event.isPromotion)
      .map((event) => event.ply);
    if (promotionPlies.length === 0) return [];

    const firstPromotionPly = Math.min(...promotionPlies);
    const patterns = [
      /\bAscension Seal\b/i,
      /\bprototype(?:\s+(?:Seal|artifact|relic|device))?\b/i,
      /\btransformation (?:device|artifact|relic)\b/i,
      /\broyal experiment\b/i,
      /\b(?:artifact|relic|device)\b[^.!?]{0,90}\b(?:made|forged|created|linked|bound|connected)\b[^.!?]{0,60}\bKing(?:['’]s)?\b/i,
      /\b(?:artifact|relic|device)\b[^.!?]{0,90}\b(?:choose|chooses|chose|sense|senses|decide|decides)\b[^.!?]{0,70}\bkingdom needs\b/i,
    ];

    return scenes.flatMap((scene) => {
      if (scene.ply >= firstPromotionPly) return [];
      const excerpt = patterns
        .map((pattern) => scene.fantasyNarration.match(pattern)?.[0])
        .find((match): match is string => Boolean(match));
      if (!excerpt) return [];
      return [
        {
          type: 'premature-promotion-reveal',
          severity: 'error',
          message: `Promotion artifact identity or purpose appears before its first activation at ply ${firstPromotionPly}`,
          ply: scene.ply,
          pieceId: null,
          excerpt,
        },
      ];
    });
  }

  validateCheckmateKingDeath(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    if (ledger.metadata.termination !== 'checkmate') return [];
    const checkmateEvent = ledger.events.find((event) => event.isCheckmate);
    if (!checkmateEvent) return [];
    const kingId = checkmateEvent.checkmateExplanation?.kingId;
    const king = ledger.pieces.find((piece) => piece.id === kingId);
    const scene = scenes.find(
      (candidate) => candidate.ply === checkmateEvent.ply,
    );
    if (!king || !scene) return [];

    const aliases = characterAliases(king);
    const aliasPattern = aliases
      .filter((alias) => alias.trim().length > 0)
      .sort((left, right) => right.length - left.length)
      .map(escapeRegex)
      .join('|');
    const contradiction = scene.fantasyNarration.match(
      new RegExp(
        `(?:\\b(?:${aliasPattern})\\b[^.!?]{0,160}\\b(?:alive|survived|survives)\\b|\\b(?:leaving|left|kept)\\s+(?:him|the King)\\s+alive\\b)`,
        'i',
      ),
    )?.[0];
    const explicitDeath =
      /\b(?:killed|dies|died|dead|slain|lifeless|perished)\b/i.test(
        scene.fantasyNarration,
      ) ||
      /\b(?:ended|claimed|took)\s+(?:the\s+)?(?:King['’]s|his)\s+life\b/i.test(
        scene.fantasyNarration,
      );
    if (!contradiction && explicitDeath) return [];

    return [
      {
        type: 'missing-checkmate',
        severity: 'error',
        message: contradiction
          ? `${king.permanentName} must die in the final checkmate scene but is explicitly described as alive`
          : `${king.permanentName} must die visibly in the final checkmate scene`,
        ply: checkmateEvent.ply,
        pieceId: king.id,
        excerpt: contradiction ?? scene.fantasyNarration.slice(0, 240),
      },
    ];
  }

  validateCaptureAttribution(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
    const sceneByPly = new Map(scenes.map((scene) => [scene.ply, scene]));

    for (const event of ledger.events) {
      if (!event.isCapture || !event.capturedPieceId) continue;
      const actor = pieces.get(event.pieceId);
      const victim = pieces.get(event.capturedPieceId);
      const scene = sceneByPly.get(event.ply);
      if (!actor || !victim || !scene) continue;
      const actorAliases = characterAliases(actor);
      const victimAliases = characterAliases(victim);
      const excerpt = reversedCaptureExcerpt(
        scene.fantasyNarration,
        victimAliases,
        actorAliases,
      );
      if (!excerpt) continue;
      findings.push({
        type: 'wrong-captor',
        severity: 'error',
        message: `${actor.permanentName} must kill ${victim.permanentName} at ply ${event.ply}, but the prose reverses the captor and victim`,
        ply: event.ply,
        pieceId: event.pieceId,
        excerpt,
      });
    }
    return findings;
  }

  validateCheckStrainOwnership(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const kingsBySide = new Map(
      ledger.pieces
        .filter((piece) => piece.fantasyType === 'king')
        .map((piece) => [piece.side, piece]),
    );
    const sceneByPly = new Map(scenes.map((scene) => [scene.ply, scene]));
    const findings: ValidationFinding[] = [];

    for (const event of ledger.events) {
      if (!event.isCheck) continue;
      const damagedSide = event.side === 'north' ? 'south' : 'north';
      const damagedKing = kingsBySide.get(damagedSide);
      const protectedKing = kingsBySide.get(event.side);
      const scene = sceneByPly.get(event.ply);
      if (!damagedKing || !protectedKing || !scene) continue;
      const excerpt = misassignedCheckStrainExcerpt(
        scene.fantasyNarration,
        characterAliases(damagedKing),
        characterAliases(protectedKing),
      );
      if (!excerpt) continue;
      findings.push({
        type: 'invented-wound',
        severity: 'error',
        message: `Check at ply ${event.ply} must strain ${damagedKing.permanentName}, but the prose assigns its royal damage to ${protectedKing.permanentName}`,
        ply: event.ply,
        pieceId: damagedKing.id,
        excerpt,
      });
    }
    return findings;
  }

  validateRevengePayoffs(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
    selectedPayoffs: StoryOutline['selectedRevengePayoffs'] = [],
  ): ValidationFinding[] {
    const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
    const sceneByPly = new Map(scenes.map((scene) => [scene.ply, scene]));
    const findings: ValidationFinding[] = [];

    for (const selected of selectedPayoffs) {
      const event = ledger.events.find(
        (candidate) => candidate.ply === selected.payoffPly,
      );
      if (!event) continue;
      const debts = (event.interactionContext?.avengesDeaths ?? []).filter(
        (debt) => debt.deathPly === selected.deathPly,
      );
      if (debts.length === 0) continue;
      const scene = sceneByPly.get(event.ply);
      const avenger = pieces.get(event.pieceId);
      if (!scene || !avenger) continue;
      for (const debt of debts) {
        const victim = pieces.get(debt.victimPieceId);
        if (!victim) continue;
        const victimAliases = characterAliases(victim);
        if (mentionsCharacter(scene.fantasyNarration, victimAliases)) continue;
        findings.push({
          type: 'missing-revenge-payoff',
          severity: 'error',
          message: `${avenger.permanentName}'s capture at ply ${event.ply} avenges ${victim.permanentName}'s witnessed death at ply ${debt.deathPly}, but the prose does not connect the payoff to that victim`,
          ply: event.ply,
          pieceId: event.pieceId,
          excerpt: scene.fantasyNarration.slice(0, 300),
        });
      }
    }
    return findings;
  }

  validateTimedWounds(
    scenes: Array<{
      ply: number;
      fantasyNarration: string;
      characters: string[];
      woundsInflicted?: Array<{ pieceId: string; inflictedAtPly: number }>;
    }>,
    wounds: GeneratedStoryPackage['wounds'],
    ledger: GameLedger,
    validateStructuredMarkers = true,
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));

    for (const wound of wounds) {
      const piece = pieces.get(wound.pieceId);
      if (!piece) continue;
      const woundText = [wound.injury, ...wound.lastingEffects].join(' ');
      const aliases = [
        piece.permanentName,
        piece.viewpointName,
        piece.operatorName,
      ].filter(
        (name, index, all): name is string =>
          Boolean(name?.trim()) && all.indexOf(name) === index,
      );
      const otherCharacterAliases = ledger.pieces
        .filter((candidate) => candidate.id !== piece.id)
        .flatMap((candidate) => characterAliases(candidate));

      for (const scene of scenes) {
        if (
          scene.ply >= wound.inflictedAtPly ||
          !scene.characters.includes(wound.pieceId) ||
          !mentionsCharacter(scene.fantasyNarration, aliases)
        ) {
          continue;
        }
        const excerpt = matchingCharacterWoundExcerpt(
          scene.fantasyNarration,
          woundText,
          aliases,
          otherCharacterAliases,
        );
        if (!excerpt) continue;
        findings.push({
          type: 'wound-continuity',
          severity: 'warning',
          message: `${piece.permanentName}'s wound is inflicted at ply ${wound.inflictedAtPly} but appears prematurely at ply ${scene.ply}`,
          ply: scene.ply,
          pieceId: wound.pieceId,
          excerpt,
        });
      }

      const inflictionScene = scenes.find(
        (scene) => scene.ply === wound.inflictedAtPly,
      );
      const hasExactMarker = inflictionScene?.woundsInflicted?.some(
        (marker) =>
          marker.pieceId === wound.pieceId &&
          marker.inflictedAtPly === wound.inflictedAtPly,
      );
      if (validateStructuredMarkers && !hasExactMarker) {
        findings.push({
          type: 'missing-wound',
          severity: 'error',
          message: `${piece.permanentName}'s wound marker is missing from its infliction scene at ply ${wound.inflictedAtPly}`,
          ply: wound.inflictedAtPly,
          pieceId: wound.pieceId,
          excerpt: inflictionScene?.fantasyNarration.slice(0, 240) ?? null,
        });
      }

      if (
        piece.fantasyType === 'knight-commander' &&
        inflictionScene?.characters.includes(piece.id)
      ) {
        const assignedArm = mythicArmForCommander(piece, ledger.initialFen);
        const sentences = inflictionScene.fantasyNarration.match(
          /[^.!?]+[.!?]?/g,
        ) ?? [inflictionScene.fantasyNarration];
        const aliases = characterAliases(piece);
        const conflictingSentence = sentences.find((sentence) => {
          if (!mentionsCharacter(sentence, aliases)) return false;
          return (
            mentionedMythicArms(sentence).some(
              (arm) => arm.id !== assignedArm.id,
            ) ||
            (mentionsIncompatibleWeaponKind(sentence, assignedArm) &&
              /\b(?:hammer|greatsword|sword|mace|poleaxe|glaive|war[ -]axe|axe)\s+(?:movement|use|recoil|backlash|strain)\b/i.test(
                sentence,
              ))
          );
        });
        if (conflictingSentence) {
          findings.push({
            type: 'mythic-arm-ownership',
            severity: 'warning',
            message: `${piece.permanentName}'s wound scene attributes another Knight Commander's Mythic Arm; the assigned weapon is ${assignedArm.name}`,
            ply: wound.inflictedAtPly,
            pieceId: wound.pieceId,
            excerpt: conflictingSentence.trim().slice(0, 300),
          });
        }
      }
    }

    if (!validateStructuredMarkers) return findings;

    const expectedMarkers = new Set(
      wounds.map((wound) => `${wound.pieceId}:${wound.inflictedAtPly}`),
    );
    for (const scene of scenes) {
      const seenMarkers = new Set<string>();
      for (const marker of scene.woundsInflicted ?? []) {
        const key = `${marker.pieceId}:${marker.inflictedAtPly}`;
        if (
          seenMarkers.has(key) ||
          !expectedMarkers.has(key) ||
          marker.inflictedAtPly !== scene.ply
        ) {
          findings.push({
            type: 'invented-wound',
            severity: 'error',
            message: `Scene at ply ${scene.ply} contains an invalid wound marker ${key}`,
            ply: scene.ply,
            pieceId: marker.pieceId,
            excerpt: null,
          });
        }
        seenMarkers.add(key);
      }
    }
    return findings;
  }

  validateStructuredWoundReferences(
    scenes: Array<{
      ply: number;
      characters: string[];
      woundReferences?: Array<{ woundId: string; ownerPieceId: string }>;
    }>,
    wounds: GeneratedStoryPackage['wounds'],
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    const woundById = new Map(
      wounds.map((wound) => [woundIdFor(wound), wound]),
    );

    for (const scene of scenes) {
      const seen = new Set<string>();
      for (const reference of scene.woundReferences ?? []) {
        const wound = woundById.get(reference.woundId);
        if (!wound) {
          findings.push({
            type: 'invented-wound',
            severity: 'error',
            message: `Scene at ply ${scene.ply} references unknown wound ${reference.woundId}`,
            ply: scene.ply,
            pieceId: reference.ownerPieceId,
            excerpt: null,
          });
          continue;
        }
        const activeThrough = wound.recoveryPly
          ? wound.recoveryPly - 1
          : Number.POSITIVE_INFINITY;
        if (
          seen.has(reference.woundId) ||
          reference.ownerPieceId !== wound.pieceId ||
          scene.ply < wound.inflictedAtPly ||
          scene.ply > activeThrough ||
          !scene.characters.includes(wound.pieceId)
        ) {
          findings.push({
            type: 'wound-continuity',
            severity: 'error',
            message: `Scene at ply ${scene.ply} has invalid ownership or timing for wound ${reference.woundId}`,
            ply: scene.ply,
            pieceId: reference.ownerPieceId,
            excerpt: null,
          });
        }
        seen.add(reference.woundId);
      }

      for (const wound of wounds.filter(
        (candidate) => candidate.inflictedAtPly === scene.ply,
      )) {
        const woundId = woundIdFor(wound);
        if (!seen.has(woundId)) {
          findings.push({
            type: 'missing-wound',
            severity: 'error',
            message: `Scene at ply ${scene.ply} is missing structured reference ${woundId}`,
            ply: scene.ply,
            pieceId: wound.pieceId,
            excerpt: null,
          });
        }
      }
    }
    return findings;
  }

  validateUnplannedInjuries(
    scenes: Array<{
      ply: number;
      fantasyNarration: string;
      characters: string[];
    }>,
    wounds: GeneratedStoryPackage['wounds'],
    ledger: GameLedger,
  ): ValidationFinding[] {
    const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
    const woundsByPiece = new Map<string, GeneratedStoryPackage['wounds']>();
    for (const wound of wounds) {
      const entries = woundsByPiece.get(wound.pieceId) ?? [];
      entries.push(wound);
      woundsByPiece.set(wound.pieceId, entries);
    }
    const findings: ValidationFinding[] = [];

    for (const scene of scenes) {
      const event = ledger.events[scene.ply - 1];
      for (const pieceId of scene.characters) {
        const piece = pieces.get(pieceId);
        if (!piece || piece.fantasyType === 'king') continue;
        if (event?.isCapture && event.capturedPieceId === pieceId) continue;
        const activeWound = (woundsByPiece.get(pieceId) ?? []).some(
          (wound) =>
            wound.inflictedAtPly <= scene.ply &&
            (wound.recoveryPly === null || wound.recoveryPly >= scene.ply),
        );
        if (activeWound) continue;
        const aliases = characterAliases(piece);
        if (!mentionsCharacter(scene.fantasyNarration, aliases)) continue;
        const otherAliases = ledger.pieces
          .filter((candidate) => candidate.id !== pieceId)
          .flatMap((candidate) => characterAliases(candidate));
        const captureVictim = event?.capturedPieceId
          ? pieces.get(event.capturedPieceId)
          : undefined;
        const fortressDamage =
          piece.fantasyType === 'moving-fortress'
            ? unplannedFortressDamageFinding(
                scene.fantasyNarration,
                aliases,
                otherAliases,
                event?.isCapture && event.pieceId === pieceId
                  ? captureVictim
                  : undefined,
              )
            : undefined;
        const excerpt =
          fortressDamage?.excerpt ??
          unplannedInjuryExcerpt(scene.fantasyNarration, aliases, otherAliases);
        if (!excerpt) continue;
        findings.push({
          type: 'invented-wound',
          severity: fortressDamage?.severity ?? 'warning',
          message: fortressDamage
            ? fortressDamage.severity === 'error'
              ? `${piece.permanentName} has no active planned wound at ply ${scene.ply} but the Fortress explicitly sustains substantive damage; damage to the integrated Fortress counts as damage to its pilot`
              : `${piece.permanentName} may sustain ambiguous Fortress damage at ply ${scene.ply}; ownership is not explicit enough to block the story`
            : `${piece.permanentName} has no active planned wound at ply ${scene.ply} but is described with a bodily injury`,
          ply: scene.ply,
          pieceId,
          excerpt,
        });
      }
    }
    return findings;
  }

  validateWoundOwnershipTransfers(
    scenes: Array<{
      ply: number;
      fantasyNarration: string;
      characters: string[];
    }>,
    wounds: GeneratedStoryPackage['wounds'],
    ledger: GameLedger,
  ): ValidationFinding[] {
    const pieces = new Map(ledger.pieces.map((piece) => [piece.id, piece]));
    const findings: ValidationFinding[] = [];

    for (const scene of scenes) {
      const event = ledger.events[scene.ply - 1];
      const relevantWounds = wounds.filter(
        (wound) => wound.recoveryPly === null || wound.recoveryPly >= scene.ply,
      );
      if (relevantWounds.length === 0) continue;

      for (const targetId of scene.characters) {
        const target = pieces.get(targetId);
        if (!target || target.fantasyType === 'king') continue;
        if (event?.isCapture && event.capturedPieceId === targetId) continue;
        const targetAliases = characterAliases(target);
        if (!mentionsCharacter(scene.fantasyNarration, targetAliases)) continue;
        const targetWoundTexts = relevantWounds
          .filter(
            (wound) =>
              wound.pieceId === targetId && wound.inflictedAtPly <= scene.ply,
          )
          .map((wound) => [wound.injury, ...wound.lastingEffects].join(' '));
        const scenePieces = scene.characters
          .map((pieceId) => pieces.get(pieceId))
          .filter((piece): piece is GameLedger['pieces'][number] =>
            Boolean(piece),
          );
        const rawClauses = scene.fantasyNarration.match(/[^.!?;]+[.!?;]?/g) ?? [
          scene.fantasyNarration,
        ];
        const clauses = rawClauses.map((clause, index) => ({
          text: clause.trim(),
          inheritedSubjectId:
            index > 0
              ? uniqueMentionedPieceId(rawClauses[index - 1], scenePieces)
              : null,
        }));

        for (const ownerId of new Set(
          relevantWounds
            .map((wound) => wound.pieceId)
            .filter((pieceId) => pieceId !== targetId),
        )) {
          const owner = pieces.get(ownerId);
          if (!owner) continue;
          const ownerWoundText = relevantWounds
            .filter((wound) => wound.pieceId === ownerId)
            .flatMap((wound) => [wound.injury, ...wound.lastingEffects])
            .join(' ');
          const ownershipMatch = clauses
            .map(({ text: clause, inheritedSubjectId }) => {
              if (
                !mentionsCharacter(clause, targetAliases) &&
                inheritedSubjectId !== targetId
              ) {
                return null;
              }
              const fortressOwnershipTransfer =
                target.fantasyType === 'moving-fortress' &&
                owner.fantasyType === 'moving-fortress' &&
                highConfidenceFortressWoundTransfer(clause, ownerWoundText);
              if (
                !fortressOwnershipTransfer &&
                !highConfidenceWoundSignature(clause, ownerWoundText)
              ) {
                return null;
              }
              const fortressConceptTerms = fortressOwnershipTransfer
                ? matchingFamilies(
                    ownerWoundText,
                    FORTRESS_WOUND_CONCEPT_FAMILIES,
                  )
                    .filter((family) => hasAny(clause, family))
                    .flat()
                : [];
              const signatureTerms = [
                ...matchingFamilies(ownerWoundText, ANATOMY_FAMILIES).flat(),
                ...matchingFamilies(ownerWoundText, INJURY_FAMILIES).flat(),
                ...fortressConceptTerms,
                ...FORTRESS_COMPONENT_TERMS.filter((term) =>
                  hasAny(ownerWoundText, [term]),
                ),
                ...SUBSTANTIVE_FORTRESS_DAMAGE_TERMS.filter((term) =>
                  hasAny(ownerWoundText, [term]),
                ),
              ];
              if (
                targetWoundTexts.some((woundText) =>
                  highConfidenceWoundSignature(clause, woundText),
                )
              ) {
                return null;
              }
              const ownership = explicitlyAttributedWoundOwner(
                clause,
                scenePieces,
                signatureTerms,
                inheritedSubjectId,
              );
              return ownership?.pieceId === targetId
                ? { excerpt: clause, ownership }
                : null;
            })
            .find(
              (
                match,
              ): match is {
                excerpt: string;
                ownership: NonNullable<
                  ReturnType<typeof explicitlyAttributedWoundOwner>
                >;
              } => match !== null,
            );
          if (!ownershipMatch) continue;
          findings.push({
            type: 'invented-wound',
            // Possessives are explicit contradictions. Plain proximity is a
            // useful suspicion, but cannot safely block multi-character scenes.
            severity:
              ownershipMatch.ownership.basis === 'possessive' ||
              ownershipMatch.ownership.basis === 'pronoun'
                ? 'error'
                : 'warning',
            message: `${target.permanentName} appears to inherit distinctive wound details belonging to ${owner.permanentName} at ply ${scene.ply}`,
            ply: scene.ply,
            pieceId: targetId,
            excerpt: ownershipMatch.excerpt,
          });
          break;
        }
      }
    }

    return findings;
  }
}

const ANATOMY_FAMILIES = [
  ['abdomen', 'abdominal', 'belly', 'stomach', 'gut'],
  ['arm', 'forearm', 'elbow'],
  ['hand', 'palm', 'finger', 'wrist'],
  ['leg', 'thigh', 'knee', 'shin', 'calf'],
  ['foot', 'ankle', 'toe'],
  ['eye', 'sight', 'vision'],
  ['head', 'skull', 'temple', 'brow'],
  ['chest', 'rib', 'ribs', 'lung', 'lungs', 'heart'],
  ['shoulder', 'collarbone'],
  ['back', 'spine', 'spinal'],
  ['face', 'jaw', 'cheek'],
  ['wheel', 'wheels', 'wheel housing', 'axle', 'tread', 'treads'],
  ['ward plate', 'ward plates', 'armor plate', 'armor plates', 'hull'],
  ['maintenance channel', 'maintenance channels'],
  ['command cradle', 'cradle', 'restraint', 'restraints'],
] as const;

const INJURY_FAMILIES = [
  [
    'wound',
    'wounded',
    'injury',
    'injured',
    'hurt',
    'hurting',
    'pain',
    'painful',
    'ache',
    'aching',
    'damaged',
    'damage',
    'trauma',
    'traumatized',
    'sore',
    'tender',
    'swollen',
    'swelling',
    'bruise',
    'bruised',
  ],
  ['puncture', 'punctured', 'pierced', 'impaled'],
  ['burn', 'burned', 'burnt', 'scorch', 'scorched', 'charred'],
  ['cut', 'gash', 'slashed', 'laceration'],
  ['break', 'broken', 'fracture', 'fractured', 'shattered'],
  ['sever', 'severed', 'missing', 'amputated', 'torn off'],
  ['bleed', 'bleeding', 'blood'],
  ['numb', 'numbness', 'paralyzed', 'paralysis'],
  ['limp', 'limping', 'stagger', 'staggered'],
  ['concussion', 'concussed'],
  ['ruined', 'mangled'],
] as const;

const DISTINCTIVE_WOUND_FAMILIES = [
  ['magical leakage', 'magic leakage', 'leaking magic', 'magic leaked'],
  ['steering linkage', 'steering linkages'],
  ['broadside battery', 'broadside batteries'],
  ['bridge-frame gear', 'bridge-frame gears', 'bridge frame gear'],
  ['life-support cradle', 'life support cradle'],
  ['ward-siphon array', 'ward siphon array'],
] as const;

// These families describe composite pilot-machine limitations rather than
// generic Fortress vocabulary. Requiring multiple concepts lets ownership
// validation recognize a paraphrased transfer (for example, another pilot
// inheriting both Isolde's left-side trauma and control impairment) without
// treating ordinary mentions of an engine, cannon, or cradle as wounds.
const FORTRESS_WOUND_CONCEPT_FAMILIES = [
  [
    'steering linkage',
    'steering linkages',
    'control linkage',
    'control linkages',
    'control response',
    'steering response',
  ],
  ['left side', 'left-side'],
  ['right side', 'right-side'],
  [
    'pain through the cradle',
    'pain through the life-support cradle',
    'painful through the cradle',
    'painful through the life-support cradle',
    'agony through the cradle',
    'agony through the life-support cradle',
  ],
  [
    'reduced ability to maneuver',
    'limited ability to maneuver',
    'limited maneuvering',
    'reduced maneuvering',
    'slow to maneuver',
    'turn slow',
    'turning slow',
  ],
  [
    'reduced cannon precision',
    'limited cannon precision',
    'cannons less precise',
    'gun less precise',
    'guns less precise',
  ],
] as const;

const FORTRESS_IMPAIRMENT_TERMS = [
  'dead',
  'failed',
  'failing',
  'limited',
  'reduced',
  'slow',
  'sluggish',
  'impaired',
  'crippled',
  'damaged',
  'pain',
  'painful',
  'agony',
  'unable',
  'could not',
  'would not',
] as const;

const FORTRESS_COMPONENT_TERMS = [
  'armor',
  'armour',
  'armor assembly',
  'armour assembly',
  'hull',
  'engine',
  'drive',
  'steering',
  'steering linkage',
  'wheel',
  'wheels',
  'axle',
  'tread',
  'treads',
  'cannon',
  'cannons',
  'gun',
  'guns',
  'weapon',
  'weapons',
  'prow',
  'ram',
  'ward plate',
  'ward plates',
  'command cradle',
  'cradle',
  'restraint',
  'restraints',
  'life support',
  'life-support',
  'core',
  'mechanism',
  'mechanisms',
] as const;

const SUBSTANTIVE_FORTRESS_DAMAGE_TERMS = [
  'damage',
  'damaged',
  'crush',
  'crushed',
  'rupture',
  'ruptured',
  'crack',
  'cracked',
  'shatter',
  'shattered',
  'breached',
  'pierce',
  'pierced',
  'break',
  'broken',
  'fracture',
  'fractured',
  'tear',
  'torn',
  'buckle',
  'buckled',
  'split',
  'destroy',
  'destroyed',
  'jam',
  'jammed',
  'cripple',
  'crippled',
  'disable',
  'disabled',
] as const;

function prematureFortressPowerLossExcerpt(
  narration: string,
  aliases: string[],
): string | undefined {
  const sentences = narration.match(/[^.!?]+[.!?]?/g) ?? [narration];
  return sentences
    .map((sentence) => sentence.trim())
    .find((sentence) => {
      if (!mentionsCharacter(sentence, aliases)) return false;
      return (
        /\b(?:depowered|powerless[- ]to[- ]move|lost (?:all )?power|without (?:Seal |magical )?power|magic(?:al)?(?: systems?)? (?:failed|died|went dark)|Seal power (?:failed|vanished|was gone)|(?:engine|Fortress|systems?|core) (?:shut|shuts|shutting) down|life-support core (?:failed|died|went dark))\b/i.test(
          sentence,
        ) ||
        /\b(?:unable|could not|couldn't) to move\b[^.!?]{0,80}\b(?:because|after|when|as)\b[^.!?]{0,80}\b(?:magic|Seal|power)\b[^.!?]{0,30}\b(?:failed|died|vanished|ended|was gone)\b/i.test(
          sentence,
        )
      );
    });
}

const CHECK_STRAIN_TERMS = [
  'strain',
  'strained',
  'batter',
  'battered',
  'crack',
  'cracked',
  'drain',
  'drained',
  'weaken',
  'weakened',
  'shake',
  'shook',
  'jolt',
  'jolted',
  'burn',
  'burned',
  'bleed',
  'bleeding',
  'wound',
  'wounded',
  'pain',
  'destabilize',
  'destabilized',
] as const;

const ROYAL_DAMAGE_TERMS = [
  'seal',
  'ward',
  'wards',
  'defense',
  'defenses',
  'armour',
  'armor',
  'body',
  'blood',
  'hand',
  'connection',
  'current',
] as const;

function highConfidenceWoundSignature(
  narration: string,
  woundDescription: string,
): boolean {
  const sharedFortressComponents = FORTRESS_COMPONENT_TERMS.filter(
    (term) => hasAny(woundDescription, [term]) && hasAny(narration, [term]),
  );
  const sharesFortressDamage = SUBSTANTIVE_FORTRESS_DAMAGE_TERMS.some(
    (term) => hasAny(woundDescription, [term]) && hasAny(narration, [term]),
  );
  if (sharedFortressComponents.length >= 2 && sharesFortressDamage) {
    return true;
  }
  const hasDistinctiveSignature = matchingFamilies(
    woundDescription,
    DISTINCTIVE_WOUND_FAMILIES,
  ).some((family) => hasAny(narration, family));
  if (hasDistinctiveSignature) return true;
  const anatomyMatches = matchingFamilies(
    woundDescription,
    ANATOMY_FAMILIES,
  ).filter((family) => hasAny(narration, family));
  const specificInjuryMatches = matchingFamilies(
    woundDescription,
    INJURY_FAMILIES.slice(1),
  ).filter((family) => hasAny(narration, family));
  const hasGenericInjury = hasAny(narration, INJURY_FAMILIES[0]);
  return (
    (anatomyMatches.length >= 2 &&
      (hasGenericInjury || specificInjuryMatches.length > 0)) ||
    (anatomyMatches.length >= 1 && specificInjuryMatches.length >= 1)
  );
}

function highConfidenceFortressWoundTransfer(
  narration: string,
  woundDescription: string,
): boolean {
  if (!hasAny(narration, FORTRESS_IMPAIRMENT_TERMS)) return false;
  const sharedConceptCount = matchingFamilies(
    woundDescription,
    FORTRESS_WOUND_CONCEPT_FAMILIES,
  ).filter((family) => hasAny(narration, family)).length;
  return sharedConceptCount >= 2;
}

function misassignedCheckStrainExcerpt(
  narration: string,
  damagedKingAliases: string[],
  protectedKingAliases: string[],
): string | undefined {
  const sentences = narration.match(/[^.!?]+[.!?]?/g) ?? [narration];
  const clauses = sentences.flatMap((sentence) =>
    sentence
      .split(/[,;]?\s+\b(?:and|while|but|although|whereas)\b\s+/i)
      .map((clause) => clause.trim())
      .filter(Boolean),
  );
  return clauses.find((clause) => {
    if (
      !hasAny(clause, CHECK_STRAIN_TERMS) ||
      !hasAny(clause, ROYAL_DAMAGE_TERMS) ||
      !mentionsCharacter(clause, protectedKingAliases)
    ) {
      return false;
    }

    const protectedPattern = protectedKingAliases
      .sort((left, right) => right.length - left.length)
      .map(escapeRegex)
      .join('|');
    const strainPattern = CHECK_STRAIN_TERMS.map(escapeRegex).join('|');
    const royalPattern = ROYAL_DAMAGE_TERMS.map(escapeRegex).join('|');
    const explicitlyOwnedByProtectedKing =
      new RegExp(
        `\\b(?:${protectedPattern})(?:['’]s)?\\b[^.!?;]{0,100}\\b(?:${strainPattern}|${royalPattern})\\b`,
        'i',
      ).test(clause) ||
      new RegExp(
        `\\b(?:${strainPattern})\\b[^.!?;]{0,80}\\b(?:${protectedPattern})(?:['’]s)?\\b[^.!?;]{0,60}\\b(?:${royalPattern})\\b`,
        'i',
      ).test(clause);
    if (!explicitlyOwnedByProtectedKing) return false;

    const strainPositions = matchPositions(clause, CHECK_STRAIN_TERMS);
    const protectedDistance = nearestDistance(
      matchPositions(clause, protectedKingAliases),
      strainPositions,
    );
    const damagedDistance = nearestDistance(
      matchPositions(clause, damagedKingAliases),
      strainPositions,
    );
    return protectedDistance < damagedDistance;
  });
}

function woundIdFor(wound: {
  pieceId: string;
  inflictedAtPly: number;
}): string {
  return `wound:${wound.pieceId}:${wound.inflictedAtPly}`;
}

function explicitlyAttributedWoundOwner(
  clause: string,
  pieces: GameLedger['pieces'],
  woundTerms: readonly string[],
  inheritedSubjectId: string | null = null,
): {
  pieceId: string;
  basis: 'possessive' | 'pronoun' | 'proximity';
} | null {
  const woundPositions = matchPositions(clause, woundTerms);
  if (woundPositions.length === 0) return null;

  // Direct possessive ownership is the strongest available prose signal, but
  // only inside the same grammatical phrase as the wound.
  for (const woundPosition of woundPositions) {
    const possessiveOwners = pieces.filter((piece) =>
      characterAliases(piece).some((alias) => {
        const position = nearestPrecedingPosition(
          matchPossessiveAliasPositions(clause, alias),
          woundPosition,
        );
        return (
          position !== null &&
          isLocalPossessiveAttribution(clause, position, woundPosition)
        );
      }),
    );
    if (possessiveOwners.length === 1) {
      return { pieceId: possessiveOwners[0].id, basis: 'possessive' };
    }
  }

  // Participial phrases and possessive pronouns inherit a clause subject. This
  // avoids assigning "her wound" to a closer possessive object such as
  // "Ysolde's firing lane" while retaining explicit subject-pronoun ownership.
  for (const woundPosition of woundPositions) {
    const subjectOwner = clauseSubjectWoundOwner(clause, pieces, woundPosition);
    if (subjectOwner) {
      return { pieceId: subjectOwner, basis: 'pronoun' };
    }
  }

  const candidates = pieces.flatMap((piece) => {
    const aliases = characterAliases(piece);
    return woundPositions.flatMap((woundPosition) => {
      const nearestAlias = nearestPrecedingPosition(
        matchPositions(clause, aliases),
        woundPosition,
      );
      if (nearestAlias === null || woundPosition - nearestAlias > 120) {
        return [];
      }
      return [
        {
          pieceId: piece.id,
          distance: woundPosition - nearestAlias,
        },
      ];
    });
  });
  if (candidates.length === 0) {
    return inheritedSubjectId &&
      possessivePronounPrecedesWound(clause, woundPositions)
      ? { pieceId: inheritedSubjectId, basis: 'pronoun' }
      : null;
  }

  candidates.sort((left, right) => left.distance - right.distance);
  const best = candidates[0];
  const equallyStrongOwners = new Set(
    candidates
      .filter((candidate) => candidate.distance === best.distance)
      .map((candidate) => candidate.pieceId),
  );
  if (equallyStrongOwners.size !== 1) return null;
  return {
    pieceId: best.pieceId,
    basis: 'proximity',
  };
}

function clauseSubjectWoundOwner(
  clause: string,
  pieces: GameLedger['pieces'],
  woundPosition: number,
): string | null {
  const pronounPosition = nearestPrecedingPosition(
    matchPositions(clause, ['his', 'her', 'their', 'its']),
    woundPosition,
  );
  const commaPosition = clause.lastIndexOf(',', woundPosition);
  const localBoundary = commaPosition >= 0 ? commaPosition + 1 : 0;
  const localText = clause.slice(localBoundary, woundPosition);
  const isParticipial =
    commaPosition >= 0 &&
    /^\s*(?:while\s+)?(?:carrying|bearing|nursing|suffering|favoring|clutching|guarding|bleeding\s+from|limping\s+from|one\s+(?:hand|arm)\b)/i.test(
      localText,
    );
  const hasLocalPronoun =
    pronounPosition !== null &&
    pronounPosition >= localBoundary &&
    woundPosition - pronounPosition <= 80;
  if (!isParticipial && !hasLocalPronoun) return null;

  const localOwners = mentionedPiecesInRange(
    clause,
    pieces,
    localBoundary,
    pronounPosition ?? woundPosition,
  );
  if (localOwners.length === 1) return localOwners[0].pieceId;
  if (localOwners.length > 1) return null;

  const mainEnd = commaPosition >= 0 ? commaPosition : woundPosition;
  const mainOwners = mentionedPiecesInRange(clause, pieces, 0, mainEnd);
  if (mainOwners.length === 0) return null;
  const subject = mainOwners[0];
  if (isParticipial) return subject.pieceId;
  const competingOwners = mainOwners.filter(
    (owner) => owner.pieceId !== subject.pieceId,
  );
  // Later possessive names identify objects ("Ysolde's firing lane") and do
  // not replace the main subject. Other multi-character antecedents are
  // genuinely ambiguous and must fall through to a non-blocking proximity
  // finding instead of becoming a hard contradiction.
  if (
    competingOwners.some(
      (owner) => !isPossessiveMentionAt(clause, owner.position),
    )
  ) {
    return null;
  }
  return subject.pieceId;
}

function mentionedPiecesInRange(
  clause: string,
  pieces: GameLedger['pieces'],
  start: number,
  end: number,
): Array<{ pieceId: string; position: number }> {
  const earliestByPiece = new Map<string, number>();
  for (const piece of pieces) {
    const positions = matchPositions(clause, characterAliases(piece)).filter(
      (position) => position >= start && position < end,
    );
    if (positions.length > 0)
      earliestByPiece.set(piece.id, Math.min(...positions));
  }
  return [...earliestByPiece.entries()]
    .map(([pieceId, position]) => ({ pieceId, position }))
    .sort((left, right) => left.position - right.position);
}

function isPossessiveMentionAt(clause: string, position: number): boolean {
  const tail = clause.slice(position);
  const word = tail.match(/^[\p{L}\p{N}_-]+(?:\s+[\p{L}\p{N}_-]+)*/u)?.[0];
  if (!word) return false;
  return /^(?:['’]s)/.test(tail.slice(word.length));
}

function isLocalPossessiveAttribution(
  clause: string,
  possessivePosition: number,
  woundPosition: number,
): boolean {
  const distance = woundPosition - possessivePosition;
  if (distance < 0 || distance > 80) return false;
  // A comma, semicolon, colon, or dash closes the noun phrase governed by the
  // possessive. This prevents an object such as "Ysolde's Fortress" from
  // claiming a wound described in the following clause.
  return !/[,;:\u2014\u2013]/.test(
    clause.slice(possessivePosition, woundPosition),
  );
}

function uniqueMentionedPieceId(
  clause: string,
  pieces: GameLedger['pieces'],
): string | null {
  const mentioned = pieces
    .filter((piece) => mentionsCharacter(clause, characterAliases(piece)))
    .map((piece) => piece.id);
  return mentioned.length === 1 ? mentioned[0] : null;
}

function possessivePronounPrecedesWound(
  clause: string,
  woundPositions: number[],
): boolean {
  const pronounPositions = matchPositions(clause, [
    'his',
    'her',
    'their',
    'its',
  ]);
  return woundPositions.some((woundPosition) => {
    const pronounPosition = nearestPrecedingPosition(
      pronounPositions,
      woundPosition,
    );
    return pronounPosition !== null && woundPosition - pronounPosition <= 80;
  });
}

function matchPossessiveAliasPositions(text: string, alias: string): number[] {
  const positions: number[] = [];
  const pattern = new RegExp(`\\b${escapeRegex(alias)}(?:['’]s)\\b`, 'gi');
  for (const match of text.matchAll(pattern)) {
    if (match.index !== undefined) positions.push(match.index);
  }
  return positions;
}

function nearestPrecedingPosition(
  positions: number[],
  boundary: number,
): number | null {
  const preceding = positions.filter((position) => position <= boundary);
  return preceding.length ? Math.max(...preceding) : null;
}

function mentionsCharacter(narration: string, aliases: string[]): boolean {
  return aliases.some((alias) =>
    new RegExp(`\\b${escapeRegex(alias)}(?:['’]s)?\\b`, 'i').test(narration),
  );
}

function matchingCharacterWoundExcerpt(
  narration: string,
  woundDescription: string,
  aliases: string[],
  otherCharacterAliases: string[],
): string | undefined {
  const distinctive = matchingFamilies(
    woundDescription,
    DISTINCTIVE_WOUND_FAMILIES,
  );
  const anatomy = matchingFamilies(woundDescription, ANATOMY_FAMILIES);
  const injury = [
    INJURY_FAMILIES[0],
    ...matchingFamilies(woundDescription, INJURY_FAMILIES).filter(
      (family) => family !== INJURY_FAMILIES[0],
    ),
  ];
  const sentences = narration.match(/[^.!?]+[.!?]?/g) ?? [narration];
  const normalizedSentences = sentences.map((sentence) => sentence.trim());
  return normalizedSentences.find((sentence, index) => {
    const hasDistinctiveSignature = distinctive.some((family) =>
      hasAny(sentence, family),
    );
    const hasAnatomy =
      anatomy.length === 0 ||
      anatomy.some((family) => hasAny(sentence, family));
    const hasInjury = injury.some((family) => hasAny(sentence, family));
    if (!hasDistinctiveSignature && (!hasAnatomy || !hasInjury)) return false;
    if (mentionsCharacter(sentence, aliases)) {
      if (!mentionsCharacter(sentence, otherCharacterAliases)) return true;
      return nearestWoundMentionBelongsTo(
        sentence,
        aliases,
        otherCharacterAliases,
        [...anatomy, ...injury].flat(),
      );
    }
    const previousSentence = normalizedSentences[index - 1];
    return (
      Boolean(previousSentence) &&
      mentionsCharacter(previousSentence, aliases) &&
      !mentionsCharacter(sentence, otherCharacterAliases) &&
      /\b(?:he|she|his|her|they|their)\b/i.test(sentence)
    );
  });
}

function unplannedInjuryExcerpt(
  narration: string,
  aliases: string[],
  otherCharacterAliases: string[],
): string | undefined {
  const bodilyAnatomy = ANATOMY_FAMILIES.slice(0, 11).flat();
  const injuryTerms = INJURY_FAMILIES.flat();
  const sentences = narration.match(/[^.!?]+[.!?]?/g) ?? [narration];
  return sentences
    .map((sentence) => sentence.trim())
    .find((sentence) => {
      if (!hasAny(sentence, bodilyAnatomy) || !hasAny(sentence, injuryTerms)) {
        return false;
      }
      const targetPositions = matchPositions(sentence, aliases);
      const anatomyPositions = matchPositions(sentence, bodilyAnatomy);
      const injuryPositions = matchPositions(sentence, injuryTerms);
      if (
        targetPositions.length === 0 ||
        anatomyPositions.length === 0 ||
        injuryPositions.length === 0
      ) {
        return false;
      }
      const firstWoundPosition = Math.min(
        ...anatomyPositions,
        ...injuryPositions,
      );
      const targetPosition = Math.max(
        ...targetPositions.filter((position) => position <= firstWoundPosition),
      );
      if (!Number.isFinite(targetPosition)) return false;
      const lastWoundPosition = Math.max(
        ...anatomyPositions,
        ...injuryPositions,
      );
      if (lastWoundPosition - targetPosition > 160) return false;
      // Stay conservative in multi-character sentences. Pronouns and possessives
      // make deterministic ownership ambiguous (for example, "Rowan walked
      // toward Tarin ... while his palm..."). Those scenes are handled by the
      // planned-wound validator instead of guessing that Tarin owns the injury.
      return matchPositions(sentence, otherCharacterAliases).length === 0;
    });
}

function unplannedFortressDamageFinding(
  narration: string,
  aliases: string[],
  otherCharacterAliases: string[],
  captureVictim?: GameLedger['pieces'][number],
): { excerpt: string; severity: 'error' | 'warning' } | undefined {
  const sentences = narration.match(/[^.!?]+[.!?]?/g) ?? [narration];
  const damageSentence = sentences
    .map((sentence) => sentence.trim())
    .find((sentence) => {
      if (
        /\b(?:without|no)\s+(?:lasting\s+)?damage\b|\bundamaged\b|\b(?:armor|armour|plates?|hull)\s+held\s+intact\b/i.test(
          sentence,
        )
      ) {
        return false;
      }
      if (
        !mentionsCharacter(sentence, aliases) ||
        !fortressComponentSustainsDamage(sentence, aliases)
      ) {
        return false;
      }

      // A sentence naming several characters can make deterministic ownership
      // ambiguous. Only accept it when the damage language is closer to this
      // Fortress pilot than to every other named character.
      if (!mentionsCharacter(sentence, otherCharacterAliases)) return true;
      return nearestWoundMentionBelongsTo(
        sentence,
        aliases,
        otherCharacterAliases,
        [...FORTRESS_COMPONENT_TERMS, ...SUBSTANTIVE_FORTRESS_DAMAGE_TERMS],
      );
    });
  if (!damageSentence) return undefined;

  if (
    captureVictim?.fantasyType === 'moving-fortress' &&
    captureDamageBelongsToFortressVictim(
      damageSentence,
      characterAliases(captureVictim),
    )
  ) {
    return undefined;
  }

  if (
    captureVictim?.fantasyType === 'moving-fortress' &&
    !explicitlyOwnedFortressDamage(damageSentence, aliases)
  ) {
    return { excerpt: damageSentence, severity: 'warning' };
  }

  return { excerpt: damageSentence, severity: 'error' };
}

function captureDamageBelongsToFortressVictim(
  sentence: string,
  victimAliases: string[],
): boolean {
  if (
    victimAliases.some((alias) =>
      new RegExp(
        `\\b${escapeRegex(alias)}(?:['’]s)?\\b[^.!?;]{0,100}\\b(?:${SUBSTANTIVE_FORTRESS_DAMAGE_TERMS.map(escapeRegex).join('|')})\\b`,
        'i',
      ).test(sentence),
    )
  ) {
    return true;
  }

  const damage = [
    ...SUBSTANTIVE_FORTRESS_DAMAGE_TERMS,
    'snap',
    'snapped',
    'collapse',
    'collapsed',
    'fail',
    'failed',
  ]
    .map(escapeRegex)
    .join('|');
  const component = FORTRESS_COMPONENT_TERMS.map(escapeRegex).join('|');
  // During a confirmed Fortress capture, an unpossessed damaged component in
  // the path or object of the attack belongs to the ledger victim by default.
  return new RegExp(
    `\\b(?:drove|rammed|fired|struck|smashed|tore|cut|plowed|ploughed|punched)\\b[^.!?;]{0,140}\\b(?:through|into|against|open)\\s+(?:the\\s+)?(?:${damage})\\s+(?:${component})\\b`,
    'i',
  ).test(sentence);
}

function explicitlyOwnedFortressDamage(
  sentence: string,
  aliases: string[],
): boolean {
  const alias = aliases
    .filter((value) => value.trim().length > 0)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
    .join('|');
  if (!alias) return false;
  const damage = [
    ...SUBSTANTIVE_FORTRESS_DAMAGE_TERMS,
    'snap',
    'snapped',
    'collapse',
    'collapsed',
    'fail',
    'failed',
  ]
    .map(escapeRegex)
    .join('|');
  const component = FORTRESS_COMPONENT_TERMS.map(escapeRegex).join('|');
  return (
    new RegExp(
      `\\b(?:${alias})(?:['’]s|['’])\\s+(?:(?:own|forward|rear|left|right|outer|inner)\\s+){0,2}(?:${component})\\b[^.!?;]{0,80}\\b(?:${damage})\\b`,
      'i',
    ).test(sentence) ||
    new RegExp(
      `\\b(?:${damage})\\b[^.!?;]{0,60}\\b(?:${alias})(?:['’]s|['’])\\s+(?:(?:own|forward|rear|left|right|outer|inner)\\s+){0,2}(?:${component})\\b`,
      'i',
    ).test(sentence) ||
    new RegExp(
      `\\b(?:${alias})\\b[^.!?;]{0,80}\\b(?:her|his|its)\\s+own\\s+(?:${component})\\b[^.!?;]{0,60}\\b(?:${damage})\\b`,
      'i',
    ).test(sentence)
  );
}

function fortressComponentSustainsDamage(
  sentence: string,
  aliases: string[],
): boolean {
  if (
    /\b(?:enemy|enemy's|opposing|hostile)\b[^.!?;]{0,30}\b(?:armor|armour|hull|engine|drive|steering|wheels?|axle|treads?|cannons?|guns?|weapons?|prow|ram|cradle|core)\b/i.test(
      sentence,
    )
  ) {
    return false;
  }

  const componentPattern = FORTRESS_COMPONENT_TERMS.map(escapeRegex).join('|');
  const damagePattern =
    SUBSTANTIVE_FORTRESS_DAMAGE_TERMS.map(escapeRegex).join('|');
  const aliasPattern = aliases
    .filter((alias) => alias.trim().length > 0)
    .sort((left, right) => right.length - left.length)
    .map(escapeRegex)
    .join('|');
  const explicitOwner = aliasPattern
    ? `(?:(?:${aliasPattern})['’]s|its)`
    : 'its';
  const componentDescriptor =
    '(?:(?:forward|rear|outer|inner|left|right|lateral|frontal|lower|upper|main|primary|secondary|twin|broadside|armored|armoured|warded)\\s+){0,2}';
  const determiner = '(?:(?:the|an?)\\s+)?';

  // Damage must be grammatically attached to a Fortress component. Do not use
  // loose proximity: "broken ground beside the cannon" damages the terrain,
  // while "the broken cannon" damages the integrated pilot and machine.
  const damagedOwnedComponent = new RegExp(
    `\\b(?:${damagePattern})\\b\\s+${explicitOwner}\\s+${componentDescriptor}(?:${componentPattern})\\b`,
    'i',
  );
  const directlyDamagedComponent = new RegExp(
    `\\b(?:${damagePattern})\\b\\s+${determiner}${componentDescriptor}(?:${componentPattern})\\b`,
    'i',
  );
  const ownedComponentReceivesDamage = new RegExp(
    `\\b${explicitOwner}\\s+${componentDescriptor}(?:${componentPattern})\\b\\s+(?:was|were|is|are|had been|became|remained|was left|were left)\\s+(?:${damagePattern})\\b`,
    'i',
  );
  const componentHasDamageState = new RegExp(
    `\\b${determiner}${componentDescriptor}(?:${componentPattern})\\b\\s+(?:was|were|is|are|had been|became|remained|was left|were left)\\s+(?:${damagePattern})\\b`,
    'i',
  );
  const componentSuffersDestructiveEvent = new RegExp(
    `\\b${determiner}${componentDescriptor}(?:${componentPattern})\\b\\s+(?:split|splintered|broke|buckled|ruptured|cracked|shattered|jammed|collapsed|snapped|failed(?!\\s+to\\b))\\b`,
    'i',
  );
  return (
    damagedOwnedComponent.test(sentence) ||
    directlyDamagedComponent.test(sentence) ||
    ownedComponentReceivesDamage.test(sentence) ||
    componentHasDamageState.test(sentence) ||
    componentSuffersDestructiveEvent.test(sentence)
  );
}

function nearestWoundMentionBelongsTo(
  sentence: string,
  targetAliases: string[],
  otherAliases: string[],
  woundTerms: readonly string[],
): boolean {
  const woundPositions = matchPositions(sentence, woundTerms);
  if (woundPositions.length === 0) return false;
  const targetDistance = nearestDistance(
    matchPositions(sentence, targetAliases),
    woundPositions,
  );
  const otherDistance = nearestDistance(
    matchPositions(sentence, otherAliases),
    woundPositions,
  );
  return targetDistance < otherDistance;
}

function matchPositions(text: string, terms: readonly string[]): number[] {
  return terms.flatMap((term) =>
    [...text.matchAll(new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi'))].map(
      (match) => match.index,
    ),
  );
}

function nearestDistance(left: number[], right: number[]): number {
  if (left.length === 0 || right.length === 0) return Number.POSITIVE_INFINITY;
  return Math.min(...left.flatMap((a) => right.map((b) => Math.abs(a - b))));
}

function matchingFamilies(
  text: string,
  families: ReadonlyArray<readonly string[]>,
): Array<readonly string[]> {
  return families.filter((family) => hasAny(text, family));
}

function hasAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) =>
    new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(text),
  );
}

function prematureDeathExcerpt(
  narration: string,
  characterName: string,
): string | undefined {
  const name = escapeRegex(characterName);
  const patterns = [
    new RegExp(`\\b${name}(?:['’]s)?\\s+(?:last|final)\\s+breath\\b`, 'i'),
    new RegExp(
      `\\b(?:spear|sword|blade|arrow|bolt|axe|lance|shot|spell)\\b[^.!?]{0,100}\\b(?:through|into)\\s+${name}(?:['’]s)?\\s+(?:mouth|skull|head|throat|heart|chest|spine)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:dead|slain|lifeless|deceased)\\s+${name}(?:['’]s)?\\b`,
      'i',
    ),
    new RegExp(
      `\\b${name}(?:['’]s)?\\s+(?:death|corpse|remains|grave|funeral)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:death|corpse|remains|grave|funeral)\\s+of\\s+(?:the\\s+)?${name}\\b`,
      'i',
    ),
    new RegExp(
      `\\b${name}\\s+(?:was|is|lay|lies|fell|had\\s+been)\\s+(?:dead|slain|lifeless|killed)\\b`,
      'i',
    ),
    new RegExp(
      `\\b(?:killed|slew|murdered|beheaded|decapitated)\\s+(?:the\\s+)?${name}\\b`,
      'i',
    ),
  ];
  return patterns
    .map((pattern) => narration.match(pattern)?.[0])
    .find((match): match is string => Boolean(match));
}

/**
 * Resolves only a tightly scoped death pronoun: the character must be named
 * earlier in the same clause and no other character with the same pronouns may
 * appear between that name and the fatal verb. This catches an unauthorized
 * second death without guessing across sentences or ambiguous confrontations.
 */
function localPronounDeathExcerpt(
  narration: string,
  piece: GameLedger['pieces'][number],
  ledger: GameLedger,
): string | undefined {
  const objectPronoun =
    piece.pronouns === 'he/him'
      ? 'him'
      : piece.pronouns === 'she/her'
        ? 'her'
        : undefined;
  if (!objectPronoun) return undefined;

  const aliases = characterAliases(piece).sort((a, b) => b.length - a.length);
  if (aliases.length === 0) return undefined;
  const targetPattern = aliases.map(escapeRegex).join('|');
  const deathPattern = new RegExp(
    `\\b(?:killed|slew|murdered|beheaded|decapitated)\\s+${objectPronoun}\\b`,
    'i',
  );

  for (const clause of narration.match(/[^.!?;]+[.!?;]?/g) ?? []) {
    const targetMatch = new RegExp(`\\b(?:${targetPattern})\\b`, 'i').exec(
      clause,
    );
    if (!targetMatch) continue;
    const afterTarget = clause.slice(targetMatch.index + targetMatch[0].length);
    const deathMatch = deathPattern.exec(afterTarget);
    if (!deathMatch) continue;

    const competingAlias = ledger.pieces
      .filter(
        (candidate) =>
          candidate.id !== piece.id && candidate.pronouns === piece.pronouns,
      )
      .flatMap(characterAliases)
      .some((alias) =>
        new RegExp(`\\b${escapeRegex(alias)}\\b`, 'i').test(clause),
      );
    if (competingAlias) continue;

    return clause.trim();
  }
  return undefined;
}

function characterAliases(piece: GameLedger['pieces'][number]): string[] {
  return [
    piece.permanentName,
    piece.characterName,
    piece.viewpointName,
    piece.operatorName,
  ].filter(
    (name, index, all): name is string =>
      Boolean(name?.trim()) && all.indexOf(name) === index,
  );
}

function reversedCaptureExcerpt(
  narration: string,
  allegedKillerAliases: string[],
  actualKillerAliases: string[],
): string | undefined {
  const explicitDeathVerb =
    '(?:killed|slew|murdered|beheaded|decapitated|incinerated)';
  const explicitPassiveDeathVerb =
    '(?:killed|slew|murdered|beheaded|decapitated|incinerated|crushed)';
  const fatalAttackVerb =
    '(?:drove|thrust|plunged|buried|stabbed|impaled|pierced|crushed|tore|ripped|smashed)';
  const fatalTarget =
    '(?:heart|skull|brain|mouth|throat|neck|spine|chest|head)';
  const weaponSubject =
    '(?:blade|sword|spear|lance|axe|arrow|bolt|shot|gun|guns|cannon|cannons|ram|magic|spell|fire|flames|fortress|company|soldiers)';
  const clauses = narration.match(/[^.!?;]+[.!?;]?/g) ?? [narration];
  for (const clause of clauses) {
    for (const allegedKiller of allegedKillerAliases) {
      for (const actualKiller of actualKillerAliases) {
        const alleged = escapeRegex(allegedKiller);
        const actual = escapeRegex(actualKiller);
        const explicitActiveReversal = new RegExp(
          `\\b${alleged}\\b(?!['’]s)(?:(?!\\b${actual}\\b)[^.!?;]){0,120}\\b${explicitDeathVerb}\\b(?!\\s+by\\b)[^.!?;]{0,100}\\b${actual}(?:['’]s)?\\b`,
          'i',
        );
        const passiveReversal = new RegExp(
          `\\b${actual}\\b[^.!?;]{0,100}\\b(?:was|is|had\\s+been)\\s+${explicitPassiveDeathVerb}\\b[^.!?;]{0,80}\\bby\\s+${alleged}\\b`,
          'i',
        );
        const possessiveWeaponReversal = new RegExp(
          `\\b${alleged}['’]s\\s+${weaponSubject}\\b[^.!?;]{0,80}\\b${fatalAttackVerb}\\b[^.!?;]{0,80}\\b${actual}(?:['’]s)?\\s+${fatalTarget}\\b`,
          'i',
        );
        const fatalActiveReversal = new RegExp(
          `\\b${alleged}\\b(?!['’]s)(?:(?!\\b${actual}\\b)[^.!?;]){0,120}\\b${fatalAttackVerb}\\b[^.!?;]{0,100}\\b${actual}(?:['’]s)?\\s+${fatalTarget}\\b`,
          'i',
        );
        if (
          explicitActiveReversal.test(clause) ||
          passiveReversal.test(clause) ||
          possessiveWeaponReversal.test(clause) ||
          fatalActiveReversal.test(clause)
        ) {
          return clause.trim();
        }
      }
    }
  }
  return undefined;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
