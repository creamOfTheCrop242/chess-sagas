import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type SagaFeature = {
  number: string;
  title: string;
  summary: string;
  details: string[];
};

@Component({
  selector: 'app-saga-guide',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './saga-guide.component.html',
  styleUrl: './saga-guide.component.css',
})
export class SagaGuideComponent {
  readonly features: SagaFeature[] = [
    {
      number: '01',
      title: 'One game, one fractured reality',
      summary:
        'Your PGN becomes the final battle of a self-contained fantasy reality.',
      details: [
        'Every move remains anchored to the supplied game.',
        'Captures, promotions, checks, survival, and the result cannot be changed by the story.',
        'Different battle records are separate realities, not sequels with shared continuity.',
      ],
    },
    {
      number: '02',
      title: 'Named characters and companies',
      summary:
        'The figures on the board become permanent characters for that record.',
      details: [
        'Pawn companies receive a named viewpoint soldier and a randomized role such as medic, scout, captain, or spearman.',
        'Moving Fortresses have living, embedded pilots with names of their own.',
        'Names and assignments remain stable whenever the same saved game is replayed.',
      ],
    },
    {
      number: '03',
      title: 'Relationships and character arcs',
      summary:
        'Recurring characters receive loyalties, rivalries, mentorships, debts, or other evolving bonds.',
      details: [
        'Relationships develop across multiple scenes and influence later choices or grief.',
        'Promoted soldiers retain their identity, memories, wounds, and relationships.',
        'The exact cast and emotional focus vary with the opportunities present in the game.',
      ],
    },
    {
      number: '04',
      title: 'Captures, wounds, and recovery',
      summary:
        'Captures are consequential confrontations, and surviving attackers may be wounded.',
      details: [
        'A weaker fighter defeating a stronger one has a higher seeded chance of suffering a lasting wound.',
        'There is no guaranteed minimum: some battles produce no wounds, while one survivor can accumulate several.',
        'Minor injuries may receive treatment; grave wounds, scars, disabilities, and dismemberment persist when recovery is not plausible.',
      ],
    },
    {
      number: '05',
      title: 'A living battlefield',
      summary:
        'The replay tracks who acted, who was lost, who dealt each killing blow, and how survivors changed.',
      details: [
        'Hover cards reveal a character’s identity, role, company, kills, and current health.',
        'The Battlefield Ledger records captured characters and their destroyers.',
        'The active story beat highlights its principal character on the board.',
      ],
    },
    {
      number: '06',
      title: 'An ending earned by the game',
      summary:
        'The conclusion follows checkmate, resignation, draw, or another recorded termination.',
      details: [
        'A checkmated King’s death explains why escape, capture, defense, or intervention was impossible.',
        'A resignation is treated as a deliberate surrender with a story-specific consequence. The King may sacrifice or destroy the Seal, preserve it under captivity, abandon it and flee, or rarely have the surrender rejected by a victorious survivor with an established motive.',
        'The final position is classified locally as a necessary, reasonable, questionable, or premature surrender from material, check, legal defenses, and immediate mating danger. Honorable necessity and premature abandonment receive different consequences.',
        'Draws and unfinished endings do not automatically kill a King or destroy a Seal.',
      ],
    },
    {
      number: '07',
      title: 'Aftermath and later chronicles',
      summary:
        'Every completed saga closes with both immediate consequences and a later glimpse of that reality.',
      details: [
        'The first epilogue follows the battlefield, survivors, Royal Seal, and fading kingdom magic.',
        'A later chronicle may occur months, years, decades, or a generation afterward.',
        'Later endings vary by story and may follow descendants, ruins, relics, thieves, pilgrims, or the last traces of magic.',
      ],
    },
    {
      number: '08',
      title: 'Generation and preservation',
      summary:
        'A multi-stage AI pipeline analyzes, outlines, writes, validates, and prepares the saga for replay.',
      details: [
        'Longer games usually take longer to generate, and a failed validation stage may retry automatically.',
        'Details and prose vary between generations even though the chess facts remain fixed.',
        'Completed sagas enter the Hall of Records under spoiler-free battle names and can be replayed later.',
      ],
    },
    {
      number: '09',
      title: 'A distinct theatre of war',
      summary:
        'Each battle record receives a stable environment that materially shapes its saga.',
      details: [
        'Battles may unfold in flooded cities, frozen passes, ancient forests, volcanic basins, broken skylands, and other distinct settings.',
        'Terrain, weather, hazards, visibility, chokepoints, and civilian structures influence movement, tactics, wounds, and character decisions.',
        'The environment is seeded from the complete game, so retries preserve the same setting while different records can inhabit different realities.',
      ],
    },
  ];
}
