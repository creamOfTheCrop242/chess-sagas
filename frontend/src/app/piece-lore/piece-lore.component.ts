import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

type PieceLore = {
  chessName: string;
  sagaName: string;
  sigil: string;
  oath: string;
  movement: string;
  warfare: string;
  fate: string;
};

type PawnSubclass = {
  name: string;
  description: string;
};

type MythicArm = {
  name: string;
  description: string;
};

@Component({
  selector: 'app-piece-lore',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './piece-lore.component.html',
  styleUrl: './piece-lore.component.css',
})
export class PieceLoreComponent {
  readonly mythicArms: MythicArm[] = [
    {
      name: 'Stormbound Great Hammer',
      description:
        'A colossal hammer whose impacts release concussive thunder through armor, earth, and nearby formations.',
    },
    {
      name: 'Seal-Forged Greatsword',
      description:
        'A two-handed blade fed by Seal-power that burns through hostile wards as readily as physical defenses.',
    },
    {
      name: 'Gravity Mace',
      description:
        'An enchanted mace that multiplies its weight at the instant of impact without burdening its bearer between strikes.',
    },
    {
      name: 'Ward-Breaking Poleaxe',
      description:
        'A hooked and bladed arm charged to catch, split, and tear openings through magical defenses.',
    },
    {
      name: 'Crescent Glaive',
      description:
        'A sweeping polearm whose crescent edge projects short arcs of cutting realm-light beyond its physical reach.',
    },
    {
      name: 'Two-Handed War Axe',
      description:
        'A heavy axe that stores the force of every blocked blow and releases that gathered violence through later attacks.',
    },
    {
      name: 'Matched Oathbound Swords',
      description:
        'An inseparable pair wielded together; alternating strikes build and release crossing arcs of realm-light.',
    },
  ];

  readonly pawnSubclasses: PawnSubclass[] = [
    {
      name: 'Company Captain',
      description:
        'The company’s commanding officer, responsible for its orders, discipline, and survival.',
    },
    {
      name: 'Field Medic',
      description:
        'A battlefield healer who stabilizes the wounded with practical medicine and limited field remedies.',
    },
    {
      name: 'Scout',
      description:
        'A forward observer trained to read terrain, locate enemies, and warn the company of ambushes.',
    },
    {
      name: 'Shield-bearer',
      description:
        'A heavily protected line soldier trusted to anchor formations and shelter vulnerable companions.',
    },
    {
      name: 'Spearman',
      description:
        'A disciplined formation fighter who holds enemies at reach and meets charges without yielding ground.',
    },
    {
      name: 'Standard-bearer',
      description:
        'The keeper of the company banner, battlefield signals, and the symbol around which scattered soldiers rally.',
    },
    {
      name: 'Archer',
      description:
        'A ranged fighter trained to place arrows through poor visibility, spell-glare, and gaps in enemy protection.',
    },
    {
      name: 'Quartermaster',
      description:
        'The soldier responsible for preserving food, medicine, weapons, and ammunition when supply lines collapse.',
    },
    {
      name: 'Mage Acolyte',
      description:
        'A soldier apprenticed in realm-magic whose unfinished spells are useful but limited and sometimes dangerous.',
    },
    {
      name: 'Queen Candidate',
      description:
        'A gifted girl identified in childhood and trained as a possible successor should the reigning Queen die or become unable to serve. By the time she enters company service, she is old enough for battle but does not yet possess a Queen’s complete magical augmentation, fortress-grade armor, power, or authority.',
    },
    {
      name: 'Chaplain',
      description:
        'A spiritual counselor who steadies frightened soldiers, performs rites for the dead, and gives the company a moral voice during war.',
    },
    {
      name: 'Beast Handler',
      description:
        'A specialist bonded with the kingdom’s trained war beasts, directing them through battle while protecting and understanding the creatures entrusted to the company.',
    },
    {
      name: 'Swordsman',
      description:
        'A disciplined close-combat specialist whose practiced blade work is used wherever the company’s formation faces its most dangerous fighting.',
    },
  ];

  readonly pieces: PieceLore[] = [
    {
      chessName: 'King',
      sagaName: 'Bearer of the Royal Seal',
      sigil: '♚',
      oath: 'The realm’s greatest warrior-sorcerer, trained by its finest masters and able to reach across universes to siphon the magic that feeds the Royal Seal.',
      movement:
        'The King advances cautiously because he must continually maintain the connection to his lost home universe. The energy flowing through him has halted his physical aging, but even an ageless body can be exhausted, wounded, or killed when that connection comes under attack.',
      warfare:
        'The King is both an exceptional warrior and a master of magic, but much of his power is committed to channeling energy into the Seal rather than conquest. Every reality produces a different ruler: some are merciful and accept honorable surrender, while others reject it, demand harsh judgment, or order executions.',
      fate: 'Checkmate leaves the King with no safe escape. Resignation is a conscious surrender whose outcome varies across realities: a ruler may break, abandon, defend, shatter, or spend the Seal. He may accept captivity, flee into exile, or—rarely—have his surrender rejected and be executed by a vengeful survivor.',
    },
    {
      chessName: 'Queen',
      sagaName: 'Queen of Blade and High Sorcery',
      sigil: '♛',
      oath: 'Raised from birth to become the kingdom’s most complete champion, the Queen was trained by the King, Archwizards, Knight Commanders, and the veteran soldiers of its pawn companies.',
      movement:
        'Archwizard augmentation transformed her body beyond mortal limits. She may walk with deliberate armored weight or cross open ground in an explosive magical surge, but she never teleports.',
      warfare:
        'She wears extraordinarily heavy armor forged from the same nearly indestructible material as a Moving Fortress. Only her augmented body can bear it while combining master swordsmanship, broad high sorcery, resilience, and speed. Each Queen develops a persistent discipline—arcane dueling, defensive guardianship, aggressive battlemagic, battlefield control, or tactical command—that shapes her preferred approach without limiting her wider abilities.',
      fate: 'A fallen Queen leaves a kingdom without its fiercest protector. Her death should feel like the collapse of an army’s center, not the loss of an ordinary soldier.',
    },
    {
      chessName: 'Bishop',
      sagaName: 'Archwizard',
      sigil: '♝',
      oath: 'Archwizards are masters of high sorcery, but there is no single road to the title. Some rise through royal colleges; others learn from great masters, inherit old traditions, survive battlefield instruction, pursue forbidden research, teach themselves, or possess gifts no academy can explain.',
      movement:
        'Archwizards may walk to nearby positions or cross greater distances through folded space, portals, and blinks. Teleportation is one movement discipline—not the limit of their magic or a requirement for every step.',
      warfare:
        'Their arsenal includes elemental destruction, wards, bindings, counterspells, illusions, divination, transmutation, and stranger arts.',
      fate: 'When an Archwizard falls, spells may collapse, wards may fail, and magical knowledge gathered over a lifetime can vanish in an instant.',
    },
    {
      chessName: 'Knight',
      sagaName: 'Knight Commander',
      sigil: '♞',
      oath: 'Chosen from the kingdom’s most elite captains, each Knight Commander leads from the front and stands above every ordinary soldier in strength, speed, resilience, and authority.',
      movement:
        'A Knight Commander can walk nearby ground or summon a spectral mount for longer movement. The steed carries its rider and leaps across the battlefield along routes ordinary cavalry cannot follow; neither rider nor mount teleports. It is transportation only: the Commander dismounts and fights on foot with the Mythic Arm while the steed dissolves or withdraws.',
      warfare:
        'Every Knight Commander carries a Mythic Arm: a singular legendary magic-powered weapon such as a great hammer, greatsword, mace, poleaxe, glaive, war axe, or matched pair of dual-wielded swords. Mythic Arms have histories and reputations of their own, and soldiers may recognize one before they recognize its bearer.',
      fate: 'Their loss is both personal and tactical: soldiers lose a champion, and an entire wing of the army may lose its direction.',
    },
    {
      chessName: 'Rook',
      sagaName: 'Moving Fortress',
      sigil: '♜',
      oath: 'A colossal wheeled war machine commanded by a soldier who was wounded beyond the reach of healing. To preserve their life, the pilot’s broken body was permanently placed within its armored command cradle.',
      movement:
        'Enchanted wheels drive the Fortress in direct, crushing lines. Its armored mass and reinforced prow make it a devastating ram, but collision is only one of the pilot’s options. The machine never acts alone; every turn and attack is the decision of its named pilot.',
      warfare:
        'Each Fortress has its own configuration. One may carry a heavy cannon, rotary gatling gun, precision twin cannons, siege bombard, repeating ward-rifles, breach cannon, broadside batteries, or storm-caster firing magical rounds. Specialized attachments can include siege drills, stabilizers, shield generators, bridge frames, smoke projectors, recovery winches, observation masts, blade wheels, or ward-siphons.',
      fate: 'The pilot cannot survive outside the machine or without its magic life-supporting core. Destroying the Fortress kills its pilot; if a defeated kingdom loses its magic, a surviving Fortress slowly becomes both tomb and failing body as its core fades.',
    },
    {
      chessName: 'Pawn',
      sagaName: 'Soldier Company',
      sigil: '♟',
      oath: 'Each company carries its own name and history, while one named soldier gives the formation a human viewpoint. The wider company still contains officers, medics, and ordinary troops even when the chronicle follows a different specialist.',
      movement:
        'Companies advance together and hold the kingdom’s front. Their first march may cover more ground, but afterward every step is hard won.',
      warfare:
        'They capture through close combat and coordinated assaults. When a humble company defeats a greater champion, survival often comes with wounds.',
      fate: 'At the invaded kingdom’s oldest far edge lies a hidden prototype Ascension Seal—perhaps upon a forgotten pedestal, inside a cave, beneath an altar, or within another secret ancient place. It belongs to the enemy kingdom and remains linked to its King’s Royal Seal. A soldier who reaches it can commandeer that connection: the Seal reads what the invader’s kingdom needs, transforms that same person without erasing name, memories, wounds, relationships, or former role, and injures the enemy King as it steals power through him. The resulting form remains unknown until Ascension occurs. A Queen Candidate is better prepared for the ordeal but is not guaranteed to become a Queen.',
    },
  ];
}
