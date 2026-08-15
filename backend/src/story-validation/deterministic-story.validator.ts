import { Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { GeneratedStoryPackage } from '../full-story/models/generated-story';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { ValidationFinding } from './models/story-validation';

@Injectable()
export class DeterministicStoryValidator {
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

  validateTimedCharacterFates(
    scenes: Array<{ ply: number; fantasyNarration: string }>,
    ledger: GameLedger,
  ): ValidationFinding[] {
    const findings: ValidationFinding[] = [];
    for (const scene of scenes) {
      for (const piece of ledger.pieces) {
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
        if (!excerpt) continue;
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
          excerpt,
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
      if (!hasExactMarker) {
        findings.push({
          type: 'missing-wound',
          severity: 'error',
          message: `${piece.permanentName}'s wound marker is missing from its infliction scene at ply ${wound.inflictedAtPly}`,
          ply: wound.inflictedAtPly,
          pieceId: wound.pieceId,
          excerpt: inflictionScene?.fantasyNarration.slice(0, 240) ?? null,
        });
      }
    }

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
        const excerpt = unplannedInjuryExcerpt(
          scene.fantasyNarration,
          aliases,
          otherAliases,
        );
        if (!excerpt) continue;
        findings.push({
          type: 'invented-wound',
          severity: 'warning',
          message: `${piece.permanentName} has no active planned wound at ply ${scene.ply} but is described with a bodily injury`,
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
      const activeWounds = wounds.filter(
        (wound) =>
          wound.inflictedAtPly <= scene.ply &&
          (wound.recoveryPly === null || wound.recoveryPly >= scene.ply),
      );
      if (activeWounds.length === 0) continue;

      for (const targetId of scene.characters) {
        const target = pieces.get(targetId);
        if (!target || target.fantasyType === 'king') continue;
        if (event?.isCapture && event.capturedPieceId === targetId) continue;
        const targetAliases = characterAliases(target);
        if (!mentionsCharacter(scene.fantasyNarration, targetAliases)) continue;
        const targetWoundTexts = activeWounds
          .filter((wound) => wound.pieceId === targetId)
          .map((wound) => [wound.injury, ...wound.lastingEffects].join(' '));
        const otherAliases = ledger.pieces
          .filter((piece) => piece.id !== targetId)
          .flatMap((piece) => characterAliases(piece));
        const sentences =
          scene.fantasyNarration.match(/[^.!?]+[.!?]?/g) ??
          [scene.fantasyNarration];

        for (const ownerId of new Set(
          activeWounds
            .map((wound) => wound.pieceId)
            .filter((pieceId) => pieceId !== targetId),
        )) {
          const owner = pieces.get(ownerId);
          if (!owner) continue;
          const ownerWoundText = activeWounds
            .filter((wound) => wound.pieceId === ownerId)
            .flatMap((wound) => [wound.injury, ...wound.lastingEffects])
            .join(' ');
          const excerpt = sentences
            .map((sentence) => sentence.trim())
            .find((sentence) => {
              if (!mentionsCharacter(sentence, targetAliases)) return false;
              if (!highConfidenceWoundSignature(sentence, ownerWoundText)) {
                return false;
              }
              const signatureTerms = [
                ...matchingFamilies(
                  ownerWoundText,
                  ANATOMY_FAMILIES,
                ).flat(),
                ...matchingFamilies(
                  ownerWoundText,
                  INJURY_FAMILIES,
                ).flat(),
              ];
              if (
                !namedCharacterPrecedesWound(
                  sentence,
                  targetAliases,
                  signatureTerms,
                )
              ) {
                return false;
              }
              if (
                targetWoundTexts.some((woundText) =>
                  highConfidenceWoundSignature(sentence, woundText),
                )
              ) {
                return false;
              }
              return woundMentionFollowsTargetMoreClosely(
                sentence,
                targetAliases,
                otherAliases,
                signatureTerms,
              );
            });
          if (!excerpt) continue;
          findings.push({
            type: 'invented-wound',
            severity: 'warning',
            message: `${target.permanentName} appears to inherit distinctive wound details belonging to ${owner.permanentName} at ply ${scene.ply}`,
            ply: scene.ply,
            pieceId: targetId,
            excerpt,
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

function highConfidenceWoundSignature(
  narration: string,
  woundDescription: string,
): boolean {
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

function namedCharacterPrecedesWound(
  sentence: string,
  aliases: string[],
  woundTerms: readonly string[],
): boolean {
  const woundPositions = matchPositions(sentence, woundTerms);
  if (woundPositions.length === 0) return false;
  const firstWoundPosition = Math.min(...woundPositions);
  const precedingAliases = matchPositions(sentence, aliases).filter(
    (position) => position <= firstWoundPosition,
  );
  if (precedingAliases.length === 0) return false;
  return firstWoundPosition - Math.max(...precedingAliases) <= 160;
}

function woundMentionFollowsTargetMoreClosely(
  sentence: string,
  targetAliases: string[],
  otherAliases: string[],
  woundTerms: readonly string[],
): boolean {
  const woundPositions = matchPositions(sentence, woundTerms);
  if (woundPositions.length === 0) return false;
  const firstWoundPosition = Math.min(...woundPositions);
  const precedingDistance = (aliases: string[]) => {
    const positions = matchPositions(sentence, aliases).filter(
      (position) => position <= firstWoundPosition,
    );
    return positions.length
      ? firstWoundPosition - Math.max(...positions)
      : Number.POSITIVE_INFINITY;
  };
  return (
    precedingDistance(targetAliases) < precedingDistance(otherAliases) &&
    precedingDistance(targetAliases) <= 160
  );
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
    const hasAnatomy =
      anatomy.length === 0 ||
      anatomy.some((family) => hasAny(sentence, family));
    const hasInjury = injury.some((family) => hasAny(sentence, family));
    if (!hasAnatomy || !hasInjury) return false;
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
  return sentences.map((sentence) => sentence.trim()).find((sentence) => {
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
    const firstWoundPosition = Math.min(...anatomyPositions, ...injuryPositions);
    const targetPosition = Math.max(
      ...targetPositions.filter((position) => position <= firstWoundPosition),
    );
    if (!Number.isFinite(targetPosition)) return false;
    const lastWoundPosition = Math.max(...anatomyPositions, ...injuryPositions);
    if (lastWoundPosition - targetPosition > 160) return false;
    // Stay conservative in multi-character sentences. Pronouns and possessives
    // make deterministic ownership ambiguous (for example, "Rowan walked
    // toward Tarin ... while his palm..."). Those scenes are handled by the
    // planned-wound validator instead of guessing that Tarin owns the injury.
    return matchPositions(sentence, otherCharacterAliases).length === 0;
  });
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
  ];
  return patterns
    .map((pattern) => narration.match(pattern)?.[0])
    .find((match): match is string => Boolean(match));
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
