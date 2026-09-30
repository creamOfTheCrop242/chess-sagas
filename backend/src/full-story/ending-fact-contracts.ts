import type { GameLedger } from '../chess/models/game-ledger';
import { kingDiesFromFate } from '../chess/models/story-ending';
import type { FullStoryRequest, EndingWorldState } from './full-story.provider';
import {
  buildSceneFactContracts,
  type FactScene,
  type SceneFactContract,
} from './scene-fact-contracts';

export interface EndingSection {
  sectionId: string;
  text: string;
}

/** Endings start from the established battle state, not from what an ending
 * claims happened. No new injury is copied back into that baseline. */
export function buildEndingFactContracts(
  ledger: GameLedger,
  wounds: FullStoryRequest['woundTimeline'],
  deaths: FullStoryRequest['deathContracts'],
  fortresses: FullStoryRequest['fortressOperatingTimeline'],
  world: EndingWorldState,
  sections: EndingSection[],
  finalBattleProse: string,
  endingDeath: FullStoryRequest['endingDeathContract'] = null,
): { contracts: SceneFactContract[]; scenes: FactScene[] } {
  const finalPly = ledger.events.at(-1)!.ply;
  // A surrender execution is after the recorded moves. It must not authorize
  // an early scene death, but must be present in the post-battle baseline.
  const completedDeaths = endingDeath
    ? [
        ...deaths,
        {
          ply: finalPly,
          noOtherDeaths: true as const,
          authorizedDeaths: [endingDeath],
        },
      ]
    : deaths;
  const baseline = buildSceneFactContracts(
    ledger,
    [
      {
        ply: finalPly,
        fantasyNarration: '',
        characters: ledger.pieces.map((p) => p.id),
      },
    ],
    [],
    wounds,
    completedDeaths,
    fortresses,
  )[0];
  const contracts = sections.map((section, index) => {
    const characters = baseline.characters
      .filter(
        (c) =>
          c.leavingWounds.length ||
          c.names.some((n) =>
            section.text.toLowerCase().includes(n.toLowerCase()),
          ),
      )
      .map((c) => {
        const piece = ledger.pieces.find((p) => p.id === c.pieceId);
        // Royal fate, not Seal destruction alone, determines death. A King
        // can destroy/spend the Seal and survive under the existing lore.
        const life =
          world.defeatedKingFate &&
          piece?.fantasyType === 'king' &&
          piece.side === world.defeatedSide &&
          kingDiesFromFate(world.defeatedKingFate)
            ? ('dead' as const)
            : c.lifeAtEnd;
        return {
          ...c,
          lifeAtStart: life,
          lifeAtEnd: life,
          enteringWounds: c.leavingWounds,
          newWounds: [],
        };
      });
    return {
      ...baseline,
      id: section.sectionId,
      ply: finalPly + index + 1,
      characters,
      facts: [
        {
          id: `${section.sectionId}:wound-continuity`,
          pieceId: null,
          requirement: `This is ${section.sectionId}, AFTER the battle. Existing wounds must keep their owner, established injurySite and effects; an injured torso does not establish an injured arm. If injurySite is null, use the recorded injury description and final battle prose, and report uncertainty rather than guessing. New harm or deterioration may occur in a narrated later event, but must not be presented as an old battle wound. Recovery after a time jump is possible, not compulsory. No injury mention is required. Final battle evidence: ${finalBattleProse}`,
        },
        {
          id: `${section.sectionId}:world-continuity`,
          pieceId: null,
          requirement: `Preserve the established post-battle state: ${JSON.stringify(world)}. No living return of someone killed in battle. A voice, memory, surviving consciousness or uncertain omen does not alone establish bodily survival. Distinguish new events after battle from rewriting past events.`,
        },
      ],
    };
  });
  return {
    contracts,
    scenes: contracts.map((c, i) => ({
      ply: c.ply,
      characters: c.characters.map((p) => p.pieceId),
      fantasyNarration: sections[i].text,
    })),
  };
}
