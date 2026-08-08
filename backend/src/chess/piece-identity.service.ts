import { Injectable } from '@nestjs/common';
import type { Chess } from 'chess.js';
import type {
  ChessColor,
  ChessPieceType,
  FantasyPieceType,
  GameLedger,
  PieceIdentity,
  Side,
} from './models/game-ledger';

const PAWN_COMPANIES = [
  'Dawn Company',
  'Briar Company',
  'River Company',
  'Iron Company',
  'Ember Company',
  'Gale Company',
  'Thorn Company',
  'Dusk Company',
] as const;

const PAWN_NAMES = [
  'Alden',
  'Ansel',
  'Aric',
  'Bram',
  'Cedric',
  'Corwin',
  'Dain',
  'Edric',
  'Elian',
  'Emrys',
  'Falk',
  'Gareth',
  'Garrick',
  'Godric',
  'Hadrian',
  'Ivor',
  'Jareth',
  'Kael',
  'Leoric',
  'Lucan',
  'Merek',
  'Niall',
  'Orin',
  'Perrin',
  'Quillan',
  'Roderic',
  'Rowan',
  'Stellan',
  'Tarin',
  'Theron',
  'Ulric',
  'Wystan',
  'Aveline',
  'Brienne',
  'Catrin',
  'Elara',
  'Elowen',
  'Fiora',
  'Gwendolyn',
  'Isolde',
  'Jessamine',
  'Kerra',
  'Lyra',
  'Maela',
  'Mara',
  'Mirelle',
  'Nerys',
  'Odette',
  'Rhiannon',
  'Sabine',
  'Sera',
  'Tamsin',
  'Veyra',
  'Wren',
  'Ysolde',
  'Zara',
] as const;

const PAWN_VIEWPOINT_NAMES = {
  north: ['Rowan', 'Elian', 'Mara', 'Tomas', 'Jake', 'Lyra', 'Corin', 'Sera'],
  south: ['Dain', 'Veyra', 'Cassian', 'Nessa', 'Rei', 'Maela', 'Orin', 'Zara'],
} as const;

const PAWN_VIEWPOINT_ROLES = {
  north: [
    'scout',
    'shield-bearer',
    'sergeant',
    'company captain',
    'spearman',
    'field medic',
    'standard-bearer',
    'company captain',
  ],
  south: [
    'spearman',
    'company captain',
    'scout',
    'sergeant',
    'shield-bearer',
    'company captain',
    'field medic',
    'standard-bearer',
  ],
} as const;

@Injectable()
export class PieceIdentityService {
  create(chess: Chess): {
    pieces: PieceIdentity[];
    squareToId: Map<string, string>;
  };
  create(
    chess: Chess,
    seed?: string,
  ): {
    pieces: PieceIdentity[];
    squareToId: Map<string, string>;
  };
  create(
    chess: Chess,
    seed = chess.fen(),
  ): {
    pieces: PieceIdentity[];
    squareToId: Map<string, string>;
  } {
    const pieces: PieceIdentity[] = [];
    const squareToId = new Map<string, string>();
    const characterNames = shuffledCharacterNames(seed);
    const pawnCount = chess
      .board()
      .flat()
      .filter((piece) => piece?.type === 'p').length;
    const pawnRoles = {
      north: shuffledPawnRoles(seed, 'north'),
      south: shuffledPawnRoles(seed, 'south'),
    };
    let pawnIndex = 0;
    let fortressIndex = 0;

    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece) continue;
        const square = piece.square;
        const identity = this.identity(
          piece.color,
          piece.type,
          square,
          piece.type === 'p' ? characterNames[pawnIndex++] : undefined,
          piece.type === 'p'
            ? pawnRoles[piece.color === 'w' ? 'north' : 'south'][
                square.charCodeAt(0) - 'a'.charCodeAt(0)
              ]
            : undefined,
          piece.type === 'r'
            ? characterNames[pawnCount + fortressIndex++]
            : undefined,
        );
        identity.backstory = pieceBackstory(identity, seed);
        pieces.push(identity);
        squareToId.set(square, identity.id);
      }
    }
    return { pieces, squareToId };
  }

  fantasyType(type: ChessPieceType): FantasyPieceType {
    return (
      {
        p: 'grunt',
        n: 'knight-commander',
        b: 'archwizard',
        r: 'moving-fortress',
        q: 'queen',
        k: 'king',
      } as const
    )[type];
  }

  private identity(
    color: ChessColor,
    type: ChessPieceType,
    square: string,
    pawnName?: string,
    pawnRole?: string,
    fortressOperatorName?: string,
  ): PieceIdentity {
    const side: Side = color === 'w' ? 'north' : 'south';
    const id = `${color}-${type}-${square}`;
    const pawnProfile =
      type === 'p'
        ? pawnNarrativeProfile(side, square, pawnName, pawnRole)
        : undefined;
    return {
      id,
      chessColor: color,
      side,
      originalSquare: square,
      chessType: type,
      currentChessType: type,
      fantasyType: this.fantasyType(type),
      permanentName:
        pawnProfile?.viewpointName ?? this.name(side, type, square),
      companyName: pawnProfile?.companyName,
      viewpointName: pawnProfile?.viewpointName,
      viewpointRole: pawnProfile?.viewpointRole,
      operatorName: type === 'r' ? fortressOperatorName : undefined,
      alive: true,
    };
  }

  private name(side: Side, type: ChessPieceType, square: string): string {
    const kingdom = side === 'north' ? 'Northern' : 'Southern';
    if (type === 'k') return `${kingdom} King`;
    if (type === 'q') return `${kingdom} Queen`;
    // The Calamity reversed east and west: a-d are eastern, e-h are western.
    const compass = `${side === 'north' ? 'North' : 'South'}${square[0] < 'e' ? 'east' : 'west'}`;
    const title =
      type === 'r'
        ? 'Fortress'
        : type === 'b'
          ? 'Archwizard'
          : 'Knight Commander';
    return `${compass} ${title}`;
  }
}

function pawnNarrativeProfile(
  side: Side,
  square: string,
  randomizedName?: string,
  randomizedRole?: string,
): { companyName: string; viewpointName: string; viewpointRole: string } {
  const fileIndex = Math.max(
    0,
    Math.min(7, square.charCodeAt(0) - 'a'.charCodeAt(0)),
  );
  const kingdom = side === 'north' ? 'Northern' : 'Southern';
  return {
    companyName: `${kingdom} ${PAWN_COMPANIES[fileIndex]}`,
    viewpointName: randomizedName ?? PAWN_VIEWPOINT_NAMES[side][fileIndex],
    viewpointRole: randomizedRole ?? PAWN_VIEWPOINT_ROLES[side][fileIndex],
  };
}

export function normalizePawnViewpoints(ledger: GameLedger): GameLedger {
  return {
    ...ledger,
    pieces: ledger.pieces.map((piece) => {
      if (piece.chessType !== 'p') {
        return {
          ...piece,
          backstory:
            piece.backstory ?? pieceBackstory(piece, ledger.initialFen),
        };
      }
      const profile = pawnNarrativeProfile(
        piece.side,
        piece.originalSquare,
        piece.viewpointName ?? piece.permanentName,
        piece.viewpointRole,
      );
      return {
        ...piece,
        permanentName: profile.viewpointName,
        companyName: profile.companyName,
        viewpointName: profile.viewpointName,
        viewpointRole: profile.viewpointRole,
        backstory: piece.backstory ?? pieceBackstory(piece, ledger.initialFen),
      };
    }),
  };
}

function pieceBackstory(piece: PieceIdentity, seed: string): string {
  const kingdom = piece.side === 'north' ? 'Light Kingdom' : 'Dark Kingdom';
  const name = piece.operatorName ?? piece.permanentName;
  const choice = (values: readonly string[], key: string): string =>
    values[hashSeed(`${seed}:${piece.id}:${key}`) % values.length];

  if (piece.chessType === 'p') {
    const origins = [
      'a family of millers who kept grain moving during the first winters after the Calamity',
      'a border village whose watch bells were rung by every child old enough to climb the tower',
      'a caravan household that crossed the kingdom repairing roads and ward-stones',
      'a riverside district where flood crews and soldiers trained beside one another',
      'an ironworking family that supplied armor but had never before sent anyone to war',
      'a remote farming settlement protected for years by the same company now carrying their banner',
      'a quarry town where every household owed one season of labor to the kingdom’s walls',
      'a crowded ward beneath the capital aqueducts where neighbors survived by sharing everything',
      'a family of itinerant healers who followed refugee columns between failing ward-lines',
      'a fishing village built around the rusting remains of a pre-Calamity watchtower',
      'a household of scribes charged with recording the names of soldiers who never returned',
      'a mountain hamlet whose people learned to navigate by the pulse of distant Seal-light',
    ];
    const formativeEvents = [
      'As a child, they guided three lost travelers home through a week-long Seal storm',
      'Their first taste of battle came while defending a ration convoy with a woodcutting axe',
      'They spent a winter helping rebuild a burned garrison and listening to its survivors',
      'A failed ward buried them beneath stone until company soldiers dug them free',
      'They once crossed enemy-held ground alone to bring medicine to an isolated household',
      'They learned discipline while serving on a flood crew where one mistake endangered an entire district',
      'A veteran taught them to read battlefield signals after discovering their unusual memory',
      'They survived a conscription march that scattered half its recruits before reaching the capital',
      'They broke a local magistrate’s order to shelter refugees during a winter shortage',
      'They inherited a battered shield from a relative whose body was never recovered',
    ];
    const motives = [
      'enlisted after raiders destroyed a neighboring settlement and left its wounded behind',
      'joined to earn citizenship and a protected home for the family left behind',
      'volunteered after a veteran saved the household during a failing Seal storm',
      'entered service to repay a company medic who once refused to abandon them',
      'took the oath after years of carrying messages between isolated garrisons',
      'was conscripted, but chose to remain after the company became the first true family they had known',
      'enlisted to keep a younger sibling from being taken in the next levy',
      'joined in search of a missing parent last seen marching beneath the company banner',
      'took the oath because service was the only path to study inside the protected capital',
      'volunteered after years of watching nobles ask sacrifices they would not make themselves',
      'entered the ranks to prove their disgraced household could still serve the realm honorably',
      'joined believing that one trained soldier could spare ten frightened civilians from fighting',
    ];
    const temperaments = [
      'They are patient under pressure but slow to forgive careless orders',
      'They hide fear behind dry humor and remember every promise made to the wounded',
      'They are fiercely practical, suspicious of glory, and protective of inexperienced soldiers',
      'They speak little in camp but become decisive when plans begin to collapse',
      'They crave recognition more than they admit and take dangerous failures personally',
      'They distrust courtly magic yet will risk anything for the people sustained by it',
      'They are generous with supplies, ruthless about discipline, and terrified of being abandoned',
      'They carry a quiet faith in ordinary soldiers rather than kings or prophecies',
      'They are curious about enemy customs and ashamed that compassion sometimes feels like disloyalty',
      'They meet danger with stubborn calm but struggle to ask others for help',
    ];
    const roleHistories: Record<string, readonly string[]> = {
      scout: [
        'An instinct for reading tracks and broken terrain made them the company scout',
        'Their memory for paths and enemy routines earned them the company’s forward watch',
      ],
      'shield-bearer': [
        'Their refusal to yield ground made them the shield-bearer trusted to anchor a failing line',
        'They became shield-bearer after carrying two wounded soldiers out beneath spellfire',
      ],
      sergeant: [
        'They became sergeant by keeping frightened recruits organized when every officer was lost',
        'A talent for turning confused orders into practical action earned them a sergeant’s braid',
      ],
      'company captain': [
        'The company elected them captain after they exposed a commander who had abandoned civilians',
        'They inherited command in disaster and kept it because the survivors trusted their judgment',
      ],
      spearman: [
        'Long reach, steady timing, and endless formation drills made them the company spearman',
        'They chose the spear because holding danger at a distance once saved their family',
      ],
      'field medic': [
        'Years beside roadside healers made them the field medic soldiers seek before admitting fear',
        'They learned battlefield medicine after helplessly watching a treatable wound claim a friend',
      ],
      'standard-bearer': [
        'Their voice could rally scattered soldiers, so the company entrusted them with its standard',
        'They took up the standard when its former bearer fell and have never allowed it to touch earth',
      ],
    };
    const role = piece.viewpointRole ?? 'company soldier';
    const company = piece.companyName ?? `${kingdom} army`;
    const roleHistory = choice(
      roleHistories[role] ?? [
        `Hard experience made them a trusted ${role}`,
        `The company recognized their aptitude and trained them as a ${role}`,
      ],
      'role-history',
    );
    return `${piece.permanentName} came from ${choice(origins, 'origin')}. ${choice(formativeEvents, 'formative')}. They ${choice(motives, 'motive')}. ${roleHistory} of ${company}. ${choice(temperaments, 'temperament')}.`;
  }

  if (piece.chessType === 'r') {
    const injuries = [
      'was crushed while holding a collapsing Seal conduit long enough for civilians to escape',
      'suffered mortal burns shielding an ammunition ward from enemy spellfire',
      'was broken beyond healing beneath a fortress wheel during an evacuation',
      'survived the destruction of a border engine with injuries no healer could restore',
      'was pierced by crystallized ward-light while dragging wounded soldiers from a ruptured conduit',
      'lost the use of every limb when a collapsing bridge crushed the evacuation column they commanded',
      'was poisoned by raw realm-magic after sealing a breach with their own body still inside it',
      'suffered catastrophic wounds piloting an experimental engine away from a populated district',
    ];
    const formerDuties = [
      'a siege engineer known for repairing engines under fire',
      'a cavalry outrider who volunteered for the most dangerous evacuations',
      'an artillery officer whose crews trusted precision more than bravado',
      'a common soldier repeatedly decorated for bringing others home alive',
      'a ward technician who understood the kingdom’s machines better than its court did',
      'a company officer who challenged orders that treated soldiers as expendable',
    ];
    const attitudes = [
      'The transformation saved a life but left the pilot grieving every ordinary sensation the cradle replaced',
      'The pilot treats the fortress as a second body and fears the day its voice becomes easier to hear than human voices',
      'They accepted entombment willingly, though they still resent those who call the machine a gift',
      'They endure the cradle through fierce loyalty to the crews stationed around the fortress',
      'They conceal recurring panic beneath precise commands and meticulous maintenance rituals',
      'They consider every shot a debt because the machine consumes magic civilians also need',
    ];
    return `${name} once served as ${choice(formerDuties, 'former-duty')} and ${choice(injuries, 'injury')}. With death otherwise certain, the kingdom’s Archwizards placed the soldier’s living body inside ${piece.permanentName}; its magical cradle now sustains the pilot, who cannot survive apart from the Moving Fortress. ${choice(attitudes, 'attitude')}.`;
  }

  if (piece.chessType === 'k') {
    const upbringings = [
      'was educated among soldiers before being permitted to study at court',
      'spent youth rotating between frontier commands and the sealed royal colleges',
      'inherited the crown during the first generation born after the Calamity',
      'was raised under competing mentors who expected either a warrior or a sorcerer, never both',
      'learned statecraft while accompanying relief columns through provinces already losing magic',
      'survived an early assassination attempt that exposed how fragile the realm had become',
    ];
    const discoveries = [
      'found the distant current by repeating a forbidden meditation until another universe answered',
      'first reached the old realm while defending a city whose final ward was collapsing',
      'mapped a path across realities from fragments left by Archwizards who had failed before',
      'made contact with the lost source during a near-fatal ritual performed without witnesses',
      'recognized the old world’s magic inside a dying relic and followed its resonance home',
      'forced a connection through the fracture created when both kingdoms reached beyond reality',
    ];
    const burdens = [
      'The King privately fears that every use of the Seal deepens the fractures between realities',
      'The crown measures every victory against the civilians whose wards depend on the same finite power',
      'The King trusts soldiers more readily than courtiers but cannot admit how uncertain the connection has become',
      'Maintaining the Seal has shortened the King’s life and made rest increasingly dangerous',
      'The King believes the rival realm’s destruction might heal reality, though no Archwizard can prove it',
      'The crown keeps a secret list of settlements that will lose power first if the Seal weakens',
    ];
    return `${piece.permanentName} ${choice(upbringings, 'upbringing')}, studying warfare beside the finest commanders and magic beneath the greatest Archwizards. When the Calamity severed the kingdom’s native power, the King ${choice(discoveries, 'discovery')} and forged the Royal Seal before the last reserves failed. ${choice(burdens, 'burden')}.`;
  }

  if (piece.chessType === 'q') {
    const selections = [
      'was identified in infancy when she survived contact with an unstable shard of Seal-light',
      'was selected from the royal bloodline after court seers discovered an unmatched tolerance for realm-magic',
      'became heir after completing the Seal Vigil that overwhelmed every older candidate',
      'was chosen when the Royal Seal responded to her touch during a palace evacuation',
      'was the only royal child whose body could safely retain the augmentations required by fortress armor',
      'earned succession through an ancient trial revived when the kingdom feared its bloodline had weakened',
    ];
    const definingLessons = [
      'A pawn company taught her that command means remembering who pays for every order',
      'The Knight Commanders trained her to make speed serve judgment rather than impulse',
      'The Archwizards taught her to channel stolen realm-magic without letting it erase physical instinct',
      'The King insisted she learn defeat by sparring against veterans forbidden to flatter her',
      'Years among fortress crews taught her to respect the human cost hidden inside enchanted armor',
      'She learned diplomacy by settling disputes between companies that distrusted the royal court',
    ];
    const conflicts = [
      'She fears becoming a weapon so useful that nobody remembers she must one day rule',
      'She is compassionate toward ordinary soldiers but merciless toward officers who waste their lives',
      'She envies people free to choose lives outside the fate designed for them',
      'She believes the King conceals the true price of drawing power across realities',
      'She takes pride in her strength while quietly wondering which parts of her remain unaltered',
      'She is determined to inherit a living kingdom rather than merely avenge a dying one',
    ];
    return `${piece.permanentName} ${choice(selections, 'selection')}. Trained from childhood by the King, Archwizards, Knight Commanders, and soldier companies, her magically augmented body can bear nearly indestructible fortress-grade armor and fight with superhuman speed. ${choice(definingLessons, 'lesson')}. ${choice(conflicts, 'conflict')}.`;
  }

  if (piece.chessType === 'b') {
    const awakenings = [
      'contained a wild spell that had already consumed three trained adepts',
      'was discovered making rain fall upward over a remote drought-stricken village',
      'survived reading a pre-Calamity grimoire whose previous owners had lost their minds',
      'closed a fracture in local reality before the royal colleges knew it existed',
      'was arrested for using forbidden magic to protect refugees from a noble’s guards',
      'called light from a dead ward-stone during a winter when the district had no power',
      'teleported instinctively across a river to escape a collapsing bridge',
      'was born during a Seal surge that left every mirror in the household showing another sky',
    ];
    const specialties = [
      'defensive wards and the redirection of hostile force',
      'elemental fire, heat, and the dangerous transformation of matter',
      'healing sigils and the manipulation of living magical currents',
      'battlefield illusion, concealment, and attacks against perception',
      'gravity, binding fields, and the reinforcement of failing structures',
      'weather-working and the reading of energy carried through air and water',
      'counterspells designed to unravel enemy magic without detonating it',
      'memory magic and the recovery of knowledge trapped inside damaged relics',
    ];
    const convictions = [
      'They regard teleportation as transportation, not a substitute for the wider magic they command',
      'They distrust the Royal Seal but remain because abandoning it would condemn millions',
      'They teach apprentices that power without restraint merely repeats the Calamity',
      'They pursue victory partly to recover knowledge held by the rival kingdom',
      'They are brilliant in crisis and notoriously impatient with court ceremony',
      'They keep meticulous records because reality itself can no longer be trusted to remember correctly',
    ];
    return `${piece.permanentName} first drew royal notice after they ${choice(awakenings, 'awakening')}. Decades in the royal colleges made the Archwizard a master of ${choice(specialties, 'specialty')}, alongside the broad disciplines expected of their rank. Teleportation lets them cross the battlefield almost instantly. ${choice(convictions, 'conviction')}.`;
  }

  if (piece.chessType === 'n') {
    const origins = [
      'rose from a frontier cavalry order that patrolled beyond reliable Seal-light',
      'began as a courier carrying orders between forces conventional routes could not connect',
      'was raised among mounted wardens who hunted creatures displaced by fractured reality',
      'earned a commission after organizing villagers into an improvised cavalry defense',
      'came from a disgraced military household and entered service under an assumed name',
      'transferred from the infantry after repeatedly predicting enemy movement before the scouts did',
      'was once a tournament rider until a border disaster exposed the emptiness of ceremonial glory',
      'joined a wandering order that rescued settlements the crown could no longer reliably reach',
    ];
    const feats = [
      'led scattered survivors through an encirclement no conventional route could escape',
      'crossed broken terrain overnight to reinforce a company believed already lost',
      'captured an enemy command post without sacrificing a single rider',
      'disobeyed a retreat order to evacuate civilians trapped behind the line',
      'turned a feigned collapse into the decisive countercharge of a winter campaign',
      'tracked a raiding host through a reality storm that erased roads behind it',
      'held three separate commands together after their officers fell in the same ambush',
      'defeated a celebrated rival by refusing the obvious route into battle',
    ];
    const styles = [
      'They prize initiative but carry guilt for soldiers unable to match their pace',
      'They plan several escape routes and trust none of them until the final rider is safe',
      'They cultivate an image of reckless confidence to conceal a deeply methodical mind',
      'They demand honesty from scouts and tolerate disagreement better than flattery',
      'They believe surprise is valuable only when it protects slower formations',
      'They are intensely loyal to their riders and openly skeptical of distant royal strategy',
    ];
    return `${piece.permanentName} ${choice(origins, 'order-origin')} and ${choice(feats, 'command-feat')}. The crown rewarded that judgment with command of one of the kingdom’s fastest and most unpredictable striking forces. ${choice(styles, 'command-style')}.`;
  }

  return `${piece.permanentName} has served the ${kingdom} through years of preparation for this final battle.`;
}

function shuffledCharacterNames(seed: string): string[] {
  return shuffledValues(PAWN_NAMES, seed);
}

function shuffledPawnRoles(seed: string, side: Side): string[] {
  return shuffledValues(PAWN_VIEWPOINT_ROLES[side], `${seed}:${side}:roles`);
}

function shuffledValues<T>(source: readonly T[], seed: string): T[] {
  const values = [...source];
  let state = hashSeed(seed);
  for (let index = values.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [values[index], values[swapIndex]] = [values[swapIndex], values[index]];
  }
  return values;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
