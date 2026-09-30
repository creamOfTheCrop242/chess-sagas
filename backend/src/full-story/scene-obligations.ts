import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type {
  CaptureDirective,
  SceneDeathDirective,
  CheckStrainDirective,
  WoundTimelineDirective,
} from './full-story.provider';
import type { ValidationFinding } from '../story-validation/models/story-validation';
import { groundedExcerpt } from './review-evidence';
import { checkmateChronology } from './checkmate-chronology';

export interface SceneObligation {
  id: string;
  ply: number;
  requirement: string;
}

export function buildRevengeRoles(
  ledger: GameLedger,
  selected: StoryOutline['selectedRevengePayoffs'],
) {
  return selected.flatMap((selection) => {
    const payoff = ledger.events.find((e) => e.ply === selection.payoffPly);
    const death = ledger.events.find((e) => e.ply === selection.deathPly);
    if (
      !payoff ||
      !death?.capturedPieceId ||
      payoff.capturedPieceId !== death.pieceId ||
      !payoff.interactionContext?.avengesDeaths?.some(
        (d) =>
          d.deathPly === death.ply && d.victimPieceId === death.capturedPieceId,
      )
    )
      return [];
    const name = (id: string) => {
      const p = ledger.pieces.find((p) => p.id === id);
      return p?.characterName ?? p?.operatorName ?? p?.permanentName ?? id;
    };
    return [
      {
        ply: payoff.ply,
        deathPly: death.ply,
        avengerId: payoff.pieceId,
        fallenAllyId: death.capturedPieceId,
        killerId: death.pieceId,
        direction: `${name(payoff.pieceId)} avenges ${name(death.capturedPieceId)} by killing ${name(death.pieceId)}. ${name(death.pieceId)} killed ${name(death.capturedPieceId)} at beat ${death.ply}; never reverse these roles.`,
      },
    ];
  });
}

export function buildSceneObligations(
  ledger: GameLedger,
  captures: CaptureDirective[],
  deaths: SceneDeathDirective[],
  checks: CheckStrainDirective[],
  wounds: WoundTimelineDirective[],
  selected: StoryOutline['selectedRevengePayoffs'],
): SceneObligation[] {
  const items: SceneObligation[] = [];
  const add = (ply: number, key: string, requirement: string) =>
    items.push({ id: `${ply}:${key}`, ply, requirement });
  captures.forEach((c) => add(c.ply, 'capture', c.requiredOutcome));
  deaths
    .flatMap((d) => d.authorizedDeaths)
    .filter((d) => d.deathCatalogId)
    .forEach((d) =>
      add(
        d.ply,
        `death:${d.authorizedVictimId}`,
        [JSON.stringify(d), checkmateChronology(ledger, d)]
          .filter(Boolean)
          .join(' '),
      ),
    );
  checks.forEach((c) =>
    add(
      c.ply,
      'check',
      `${c.checkingPieceNames.join('/')} attacks ${c.damagedKingNames.join('/')}; show NEW royal strain to that King. ${c.protectedKingNames.join('/')} must not receive this check's strain. Existing pain alone is not a new increment.`,
    ),
  );
  wounds.forEach((w) =>
    add(
      w.inflictedAtPly,
      w.woundId,
      `Show cause before new injury: ${JSON.stringify(w)}`,
    ),
  );
  buildRevengeRoles(ledger, selected).forEach((r) =>
    add(r.ply, 'revenge', r.direction),
  );
  ledger.events
    .filter((e) => e.isPromotion)
    .forEach((e) => add(e.ply, 'promotion', JSON.stringify(e)));
  return items;
}

export interface ObligationAssessment {
  obligationId: string;
  status: 'satisfied' | 'contradiction' | 'omitted' | 'uncertain';
  confidence: 'high' | 'medium' | 'low';
  excerpt: string | null;
  reason: string;
}

export function obligationFindings(
  obligations: SceneObligation[],
  scenes: Array<{ ply: number; fantasyNarration: string }>,
  assessments: ObligationAssessment[],
): ValidationFinding[] {
  if (
    assessments.length !== obligations.length ||
    new Set(assessments.map((a) => a.obligationId)).size !==
      obligations.length ||
    assessments.some((a) => !obligations.some((o) => o.id === a.obligationId))
  )
    throw new Error('Incomplete repair obligation assessment');
  return assessments.flatMap((a) => {
    if (a.status === 'satisfied') return [];
    const obligation = obligations.find((o) => o.id === a.obligationId)!;
    const text =
      scenes.find((s) => s.ply === obligation.ply)?.fantasyNarration ?? '';
    const excerpt = groundedExcerpt(text, a.excerpt);
    const grounded = excerpt !== null;
    return [
      {
        type: 'outline-continuity' as const,
        severity:
          a.confidence === 'high' && grounded && a.status !== 'uncertain'
            ? ('error' as const)
            : ('warning' as const),
        ply: obligation.ply,
        pieceId: null,
        excerpt,
        message: `Repair obligation ${obligation.id}: ${a.reason}. Required: ${obligation.requirement}`,
      },
    ];
  });
}
