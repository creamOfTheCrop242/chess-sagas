import type { GameLedger, PieceIdentity } from '../chess/models/game-ledger';
import type { NarrativeAnalysis } from './models/narrative-analysis';

const FALLBACK_INJURY = 'Painful impact injury';
const FALLBACK_EFFECT = 'Persistent pain and reduced mobility';

export function sanitizeWoundStatusText(
  analysis: NarrativeAnalysis,
  ledger: GameLedger,
): NarrativeAnalysis {
  const piecesById = new Map(ledger.pieces.map((piece) => [piece.id, piece]));

  return {
    ...analysis,
    woundPlans: analysis.woundPlans.map((wound) => {
      const owner = piecesById.get(wound.pieceId);
      const source = wound.sourcePieceId
        ? piecesById.get(wound.sourcePieceId)
        : undefined;
      const injury = sanitizeField(wound.injury, ledger.pieces, owner, source);
      const lastingEffects = wound.lastingEffects
        .map((effect) => sanitizeField(effect, ledger.pieces, owner, source))
        .filter(isMeaningfulStatus);

      return {
        ...wound,
        injury: isMeaningfulStatus(injury) ? injury : FALLBACK_INJURY,
        lastingEffects:
          lastingEffects.length > 0 ? lastingEffects : [FALLBACK_EFFECT],
      };
    }),
  };
}

function sanitizeField(
  value: string,
  pieces: PieceIdentity[],
  owner: PieceIdentity | undefined,
  source: PieceIdentity | undefined,
): string {
  let result = value.trim();

  result = replaceAliases(
    result,
    aliasesFor(owner),
    subjectPronoun(owner),
    possessivePronoun(owner),
  );
  result = replaceAliases(
    result,
    aliasesFor(source),
    'the attacker',
    "the attacker's",
  );

  const reservedIds = new Set([owner?.id, source?.id].filter(Boolean));
  const remainingAliases = pieces
    .filter((piece) => !reservedIds.has(piece.id))
    .flatMap(aliasesFor);
  result = replaceAliases(
    result,
    remainingAliases,
    'the opposing fighter',
    "the opposing fighter's",
  );

  if (owner?.id) {
    result = result.replace(
      new RegExp(`\\b${escapePattern(owner.id)}\\b`, 'gi'),
      subjectPronoun(owner),
    );
  }
  if (source?.id) {
    result = result.replace(
      new RegExp(`\\b${escapePattern(source.id)}\\b`, 'gi'),
      'the attacker',
    );
  }

  result = result
    .replace(/\b[wb]-[pnbrqk]-[a-h][1-8]\b/gi, '')
    .replace(/\b(?:at|on|during)\s+(?:the\s+)?(?:ply\s*)?\d+\b/gi, '')
    .replace(/\bply\s*\d+\b/gi, '')
    .replace(/\b(?:at|on|near|from|toward|towards|into)\s+[a-h][1-8]\b/gi, '')
    .replace(/\b[a-h][1-8]\b/gi, '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/\b(?:at|on|during|near|from|toward|towards|into)\s*([,.;:!?]|$)/gi, '$1')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[,;:\s]+|[,;:\s]+$/g, '')
    .trim();

  return capitalize(result);
}

function aliasesFor(piece: PieceIdentity | undefined): string[] {
  if (!piece) return [];
  return [
    piece.permanentName,
    piece.characterName,
    piece.viewpointName,
    piece.operatorName,
    piece.companyName,
  ].filter((name): name is string => Boolean(name?.trim()));
}

function replaceAliases(
  value: string,
  aliases: string[],
  replacement: string,
  possessiveReplacement: string,
): string {
  return [...new Set(aliases)]
    .sort((left, right) => right.length - left.length)
    .reduce((text, alias) => {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return text
        .replace(
          new RegExp(`(?:^|(?<=\\W))${escaped}(?:['’]s)(?=$|\\W)`, 'gi'),
          possessiveReplacement,
        )
        .replace(
          new RegExp(`(?:^|(?<=\\W))${escaped}(?=$|\\W)`, 'gi'),
          replacement,
        );
    }, value);
}

function subjectPronoun(piece: PieceIdentity | undefined): string {
  if (piece?.pronouns === 'she/her') return 'she';
  if (piece?.pronouns === 'he/him') return 'he';
  return 'they';
}

function possessivePronoun(piece: PieceIdentity | undefined): string {
  if (piece?.pronouns === 'she/her') return 'her';
  if (piece?.pronouns === 'he/him') return 'his';
  return 'their';
}

function capitalize(value: string): string {
  return value ? `${value[0].toUpperCase()}${value.slice(1)}` : value;
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isMeaningfulStatus(value: string): boolean {
  const words = value.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.some(
    (word) =>
      ![
        'a',
        'an',
        'the',
        'he',
        'her',
        'him',
        'his',
        'she',
        'their',
        'them',
        'they',
      ].includes(word),
  );
}
