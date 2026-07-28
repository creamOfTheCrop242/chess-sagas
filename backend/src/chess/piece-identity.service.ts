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

const FORTRESS_OPERATORS = {
  north: { west: 'Torren', east: 'Ysabet' },
  south: { west: 'Varric', east: 'Morwen' },
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
    const pawnNames = shuffledPawnNames(seed);
    let pawnIndex = 0;

    for (const row of chess.board()) {
      for (const piece of row) {
        if (!piece) continue;
        const square = piece.square;
        const identity = this.identity(
          piece.color,
          piece.type,
          square,
          piece.type === 'p' ? pawnNames[pawnIndex++] : undefined,
        );
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
  ): PieceIdentity {
    const side: Side = color === 'w' ? 'north' : 'south';
    const id = `${color}-${type}-${square}`;
    const pawnProfile =
      type === 'p' ? pawnNarrativeProfile(side, square, pawnName) : undefined;
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
      operatorName:
        type === 'r'
          ? FORTRESS_OPERATORS[side][square[0] < 'e' ? 'west' : 'east']
          : undefined,
      alive: true,
    };
  }

  private name(side: Side, type: ChessPieceType, square: string): string {
    const kingdom = side === 'north' ? 'Northern' : 'Southern';
    if (type === 'k') return `${kingdom} King`;
    if (type === 'q') return `${kingdom} Queen`;
    const compass = `${side === 'north' ? 'North' : 'South'}${square[0] < 'e' ? 'west' : 'east'}`;
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
): { companyName: string; viewpointName: string; viewpointRole: string } {
  const fileIndex = Math.max(
    0,
    Math.min(7, square.charCodeAt(0) - 'a'.charCodeAt(0)),
  );
  const kingdom = side === 'north' ? 'Northern' : 'Southern';
  return {
    companyName: `${kingdom} ${PAWN_COMPANIES[fileIndex]}`,
    viewpointName: randomizedName ?? PAWN_VIEWPOINT_NAMES[side][fileIndex],
    viewpointRole: PAWN_VIEWPOINT_ROLES[side][fileIndex],
  };
}

export function normalizePawnViewpoints(ledger: GameLedger): GameLedger {
  return {
    ...ledger,
    pieces: ledger.pieces.map((piece) => {
      if (piece.chessType !== 'p') return piece;
      const profile = pawnNarrativeProfile(
        piece.side,
        piece.originalSquare,
        piece.viewpointName ?? piece.permanentName,
      );
      return {
        ...piece,
        permanentName: profile.viewpointName,
        companyName: profile.companyName,
        viewpointName: profile.viewpointName,
        viewpointRole: profile.viewpointRole,
      };
    }),
  };
}

function shuffledPawnNames(seed: string): string[] {
  const names = [...PAWN_NAMES];
  let state = hashSeed(seed);
  for (let index = names.length - 1; index > 0; index -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [names[index], names[swapIndex]] = [names[swapIndex], names[index]];
  }
  return names;
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
