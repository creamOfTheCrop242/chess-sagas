import type { GameLedger } from '../chess/models/game-ledger';
import type { SceneDeathDirective } from './full-story.provider';

export const CHECKMATE_STAGING_INSTRUCTIONS = `Use checkmateExplanation as internal staging, not reader-facing chess commentary. Show the fatal attacker and important supporting characters through concrete actions that close the King's available escapes and prevent help from reaching him. Do not inventory squares or explain tactical legality. Name the attacker and victim naturally and describe how the contracted attack kills the King on page. Show royal strain while he is still alive, possibly within that same lethal assault, followed by his death and Royal Seal failure. Show the attack's effect rather than labeling it an established or authorized attack. These are prose instructions, not required phrases or keyword bans; scene facts determine correctness.`;

/** One temporal contract shared by drafting, scene review, and targeted repair. */
export function checkmateChronology(
  ledger: GameLedger,
  death: SceneDeathDirective['authorizedDeaths'][number],
): string {
  const event = ledger.events.find((e) => e.ply === death.ply);
  if (
    !event?.isCheckmate ||
    death.eventKind !== 'checkmate' ||
    death.authorizedVictimId !== event.checkmateExplanation?.kingId
  )
    return '';
  return `Final-event chronology for King ${death.authorizedVictimId}: new royal check strain occurs while he is alive, before or during the fatal assault by ${death.decisiveActorId}; that actor kills him by the contracted method; his Royal Seal then fails and his kingdom's controlled magic stops. The strain and lethal attack may be one continuous action, not separate numbered stages. Never give the dead King new experienced pain, strain, awareness, or deliberate action. Death throes during the lethal assault, passive movement of a corpse, and clearly retrospective descriptions are not new post-death strain. If this is a capturing checkmate, the captured defender must also die, but may die in the same attack; no strict order between the two deaths is required. Judge event chronology, not sentence order or keywords; genuinely uncertain timing is a warning, not a confirmed contradiction.`;
}
