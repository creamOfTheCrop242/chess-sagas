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

@Component({
  selector: 'app-piece-lore',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './piece-lore.component.html',
  styleUrl: './piece-lore.component.css',
})
export class PieceLoreComponent {
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
      name: 'Sergeant',
      description:
        'An experienced junior officer who turns the captain’s commands into practical action among the ranks.',
    },
    {
      name: 'Archer',
      description:
        'A ranged fighter trained to place arrows through poor visibility, spell-glare, and gaps in enemy protection.',
    },
    {
      name: 'Sapper',
      description:
        'A specialist in traps, demolition, tunneling, breached walls, and rapidly constructed battlefield defenses.',
    },
    {
      name: 'Outrider',
      description:
        'A mounted scout and messenger who patrols exposed flanks and carries urgent orders across dangerous ground.',
    },
    {
      name: 'Quartermaster',
      description:
        'The soldier responsible for preserving food, medicine, weapons, and ammunition when supply lines collapse.',
    },
    {
      name: 'Signaler',
      description:
        'A communications specialist who uses horns, flags, lamps, and codes to coordinate separated formations.',
    },
    {
      name: 'Skirmisher',
      description:
        'A lightly equipped fighter who screens the formation, harasses enemies, and survives through speed and initiative.',
    },
    {
      name: 'Siege Engineer',
      description:
        'A builder and battlefield mechanic trained to assess walls, reinforce gates, and operate or repair siege equipment.',
    },
    {
      name: 'Mage Acolyte',
      description:
        'A soldier apprenticed in realm-magic whose unfinished spells are useful but limited and sometimes dangerous.',
    },
    {
      name: 'Queen Candidate',
      description:
        'A potential future royal champion undergoing martial, magical, and company training without yet possessing a Queen’s full power or authority.',
    },
  ];

  readonly pieces: PieceLore[] = [
    {
      chessName: 'King',
      sagaName: 'Bearer of the Royal Seal',
      sigil: '♚',
      oath: 'The realm’s greatest warrior-sorcerer, trained by its finest masters and able to reach across universes to siphon the magic that feeds the Royal Seal.',
      movement:
        'The King advances cautiously because he must continually maintain the connection to his lost home universe. Even a single step can strain the flow sustaining his kingdom.',
      warfare:
        'The King is both an exceptional warrior and a master of magic, but much of his power is committed to channeling energy into the Seal rather than conquest.',
      fate: 'Checkmate leaves the King with no safe escape. Resignation is a conscious surrender whose outcome varies across realities: a ruler may break, abandon, defend, shatter, or spend the Seal. He may accept captivity, flee into exile, or—rarely—have his surrender rejected and be executed by a vengeful survivor.',
    },
    {
      chessName: 'Queen',
      sagaName: 'Queen of Blade and High Sorcery',
      sigil: '♛',
      oath: 'Raised from birth to become the kingdom’s most complete champion, the Queen was trained by the King, Archwizards, Knight Commanders, and the veteran soldiers of its pawn companies.',
      movement:
        'Archwizard augmentation transformed her body beyond mortal limits, granting the strength and speed required to cross open ground in explosive surges rather than teleporting.',
      warfare:
        'She wears extraordinarily heavy armor forged from the same nearly indestructible material as a Moving Fortress. Only her augmented body can bear it while combining master swordsmanship, broad high sorcery, resilience, and speed.',
      fate: 'A fallen Queen leaves a kingdom without its fiercest protector. Her death should feel like the collapse of an army’s center, not the loss of an ordinary soldier.',
    },
    {
      chessName: 'Bishop',
      sagaName: 'Archwizard',
      sigil: '♝',
      oath: 'A master of high sorcery whose learning reaches far beyond the art used to cross the battlefield.',
      movement:
        'Archwizards travel through folded space, portals, blinks, and other forms of teleportation. Teleportation is their movement discipline—not the limit of their magic.',
      warfare:
        'Their arsenal includes elemental destruction, wards, bindings, counterspells, illusions, divination, transmutation, and stranger arts.',
      fate: 'When an Archwizard falls, spells may collapse, wards may fail, and magical knowledge gathered over a lifetime can vanish in an instant.',
    },
    {
      chessName: 'Knight',
      sagaName: 'Knight Commander',
      sigil: '♞',
      oath: 'An elite battlefield commander trained to strike along routes no conventional formation can follow.',
      movement:
        'Knight Commanders break predictable lines, vault obstacles, and attack from unexpected angles, turning defended ground into an exposed flank.',
      warfare:
        'They combine martial skill with command authority, leading sudden charges and personally exploiting openings in the enemy host.',
      fate: 'Their loss is both personal and tactical: soldiers lose a champion, and an entire wing of the army may lose its direction.',
    },
    {
      chessName: 'Rook',
      sagaName: 'Moving Fortress',
      sigil: '♜',
      oath: 'A colossal wheeled war machine commanded by a soldier who was wounded beyond the reach of healing. To preserve their life, the pilot’s broken body was permanently placed within its armored command cradle.',
      movement:
        'Enchanted wheels drive the Fortress in direct, crushing lines. The machine never acts alone; every turn and attack is the decision of its named pilot.',
      warfare:
        'From within the hull, the pilot aims weapons that fire devastating magic rounds and controls the Fortress’s armor and immense machinery as extensions of their own wounded body.',
      fate: 'The pilot cannot survive outside the machine or without its magic life-supporting core. Destroying the Fortress kills its pilot; if a defeated kingdom loses its magic, a surviving Fortress slowly becomes both tomb and failing body as its core fades.',
    },
    {
      chessName: 'Pawn',
      sagaName: 'Soldier Company',
      sigil: '♟',
      oath: 'Each company carries its own name, history, and sworn specialist whose viewpoint gives the formation a human voice. Every kingdom fields a captain and medic, while its remaining specialists vary between realities.',
      movement:
        'Companies advance together and hold the kingdom’s front. Their first march may cover more ground, but afterward every step is hard won.',
      warfare:
        'They capture through close combat and coordinated assaults. When a humble company defeats a greater champion, survival often comes with wounds.',
      fate: 'A company that reaches the farthest rank ascends into a greater form without surrendering its former identity. Until that moment, the nature of the transformation remains hidden.',
    },
  ];
}
