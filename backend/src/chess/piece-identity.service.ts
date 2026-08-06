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
    ];
    const motives = [
      'enlisted after raiders destroyed a neighboring settlement and left its wounded behind',
      'joined to earn citizenship and a protected home for the family left behind',
      'volunteered after a veteran saved the household during a failing Seal storm',
      'entered service to repay a company medic who once refused to abandon them',
      'took the oath after years of carrying messages between isolated garrisons',
      'was conscripted, but chose to remain after the company became the first true family they had known',
    ];
    const role = piece.viewpointRole ?? 'company soldier';
    const company = piece.companyName ?? `${kingdom} army`;
    return `${piece.permanentName} came from ${choice(origins, 'origin')} and ${choice(motives, 'motive')}. Experience and temperament made them the ${role} of ${company}.`;
  }

  if (piece.chessType === 'r') {
    const injuries = [
      'was crushed while holding a collapsing Seal conduit long enough for civilians to escape',
      'suffered mortal burns shielding an ammunition ward from enemy spellfire',
      'was broken beyond healing beneath a fortress wheel during an evacuation',
      'survived the destruction of a border engine with injuries no healer could restore',
    ];
    return `${name} ${choice(injuries, 'injury')}. With death otherwise certain, the kingdom’s Archwizards placed the soldier’s living body inside ${piece.permanentName}; its magical cradle now sustains the pilot, who cannot survive apart from the Moving Fortress.`;
  }

  const histories: Record<string, readonly string[]> = {
    king: [
      `${piece.permanentName} studied war beside the realm’s finest commanders and magic beneath its greatest Archwizards. When the Calamity severed the old world’s power, the King learned to reach across realities and forged the Royal Seal before the kingdom’s last reserves failed.`,
      `${piece.permanentName} inherited a realm already dying from the loss of its native magic. Years of martial and arcane discipline allowed the King to find the distant current that now feeds the Royal Seal and every surviving wonder of the ${kingdom}.`,
    ],
    queen: [
      `${piece.permanentName} was chosen in infancy from the royal bloodline after the court’s seers recognized an unusual tolerance for Seal-magic. Raised by the King, Archwizards, Knight Commanders, and soldier companies, she was augmented to bear fortress-grade armor and defend the realm at superhuman speed.`,
      `${piece.permanentName} became heir only after surviving the Seal Vigil, a rite that overwhelmed every other candidate. From childhood she trained under every branch of the army until magic and discipline remade her into the kingdom’s most formidable living champion.`,
    ],
    archwizard: [
      `${piece.permanentName} first drew notice by containing a wild spell that had consumed three trained adepts. Decades in the royal colleges produced a master of wards, elemental forces, transformation, and battlefield teleportation sworn to protect the Seal.`,
      `${piece.permanentName} was taken into the royal colleges after forbidden talent surfaced far from the capital. The future Archwizard mastered many schools of magic, using teleportation only as the swiftest means of bringing that power wherever the line is failing.`,
    ],
    'knight-commander': [
      `${piece.permanentName} rose from a frontier cavalry order after leading scattered survivors through an encirclement no conventional route could escape. The crown rewarded that instinct with command of the kingdom’s fastest and most unpredictable striking force.`,
      `${piece.permanentName} earned command by repeatedly reaching isolated companies before the enemy believed help could arrive. Years of campaigning turned an audacious rider into a disciplined commander trusted with attacks across broken terrain.`,
    ],
  };
  return choice(
    histories[piece.fantasyType] ?? [
      `${piece.permanentName} has served the ${kingdom} through years of preparation for this final battle.`,
    ],
    'history',
  );
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
