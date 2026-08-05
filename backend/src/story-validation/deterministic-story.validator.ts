import { Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { GeneratedStoryPackage } from '../full-story/models/generated-story';
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
}

const ANATOMY_FAMILIES = [
  ['abdomen', 'abdominal', 'belly', 'stomach', 'gut'],
  ['arm', 'forearm', 'elbow'],
  ['hand', 'palm', 'finger', 'wrist'],
  ['leg', 'thigh', 'knee', 'shin', 'calf'],
  ['foot', 'ankle', 'toe'],
  ['eye', 'sight', 'vision'],
  ['head', 'skull', 'temple', 'brow'],
  ['chest', 'rib', 'lung', 'heart'],
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
] as const;

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
  return [piece.permanentName, piece.viewpointName, piece.operatorName].filter(
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
