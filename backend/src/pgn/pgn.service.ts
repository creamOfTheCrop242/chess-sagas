import { BadRequestException, Injectable } from '@nestjs/common';
import { Chess, type Square } from 'chess.js';
import { GameLedgerService } from '../chess/game-ledger.service';
import type { GameLedger } from '../chess/models/game-ledger';

export type PieceCode = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export type NearbyEnemy = {
  piece: PieceCode;
  square: string;
  color: 'w' | 'b';
  wing?: 'Eastern' | 'Western';
  distance: number;
};

export type TargetedEnemy = {
  piece: PieceCode;
  square: string;
  color: 'w' | 'b';
  wing?: 'Eastern' | 'Western';
};

export type ParsedPosition = {
  ply: number;
  san: string;
  fen: string;
  color: 'w' | 'b';
  piece: PieceCode;
  from: string;
  to: string;
  captured?: PieceCode;
  promotion?: PieceCode;
  isCapture: boolean;
  isCheck: boolean;
  isCheckmate: boolean;
  isCastle: boolean;
  nearbyEnemies: NearbyEnemy[];
  targetedEnemies: TargetedEnemy[];
};

export type Realms = {
  white: 'Light Kingdom';
  black: 'Dark Kingdom';
  whiteKingName?: string;
  blackKingName?: string;
};

export type ParsedPgn = {
  headers: Record<string, string>;
  startFen: string;
  positions: ParsedPosition[];
  realms: Realms;
  ledger: GameLedger;
};

const NEAR_DISTANCE = 2;

@Injectable()
export class PgnService {
  constructor(private readonly gameLedger: GameLedgerService) {}

  parse(pgn: string): ParsedPgn {
    const trimmed = pgn?.trim();
    if (!trimmed) {
      throw new BadRequestException('PGN is required');
    }

    const chess = new Chess();
    try {
      chess.loadPgn(trimmed, { strict: false });
    } catch {
      throw new BadRequestException('Invalid PGN');
    }

    const history = chess.history({ verbose: true });
    if (history.length === 0) {
      throw new BadRequestException('PGN contains no moves');
    }

    const rawHeaders = chess.header();
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(rawHeaders)) {
      if (value != null && value !== '') {
        headers[key] = String(value);
      }
    }

    const realms = this.buildRealms(headers);
    const initialFen = headers['FEN'];
    const replay = initialFen ? new Chess(initialFen) : new Chess();
    const startFen = replay.fen();
    const positions: ParsedPosition[] = [];

    for (const move of history) {
      const result = replay.move(move.san);
      if (!result) {
        throw new BadRequestException('Failed to replay PGN moves');
      }

      const isCheckmate = replay.isCheckmate();
      const isCheck = !isCheckmate && replay.isCheck();
      const isCastle = result.flags.includes('k') || result.flags.includes('q');

      const position: ParsedPosition = {
        ply: positions.length + 1,
        san: result.san,
        fen: replay.fen(),
        color: result.color,
        piece: result.piece,
        from: result.from,
        to: result.to,
        isCapture:
          Boolean(result.captured) ||
          result.flags.includes('c') ||
          result.flags.includes('e'),
        isCheck,
        isCheckmate,
        isCastle,
        nearbyEnemies: this.findNearbyEnemies(replay, result.to, result.color),
        targetedEnemies: this.findTargetedEnemies(
          replay,
          result.to,
          result.color,
          result.promotion ?? result.piece,
        ),
      };

      if (result.captured) {
        position.captured = result.captured;
      }
      if (result.promotion) {
        position.promotion = result.promotion;
      }

      positions.push(position);
    }

    const ledger = this.gameLedger.build(headers, history, startFen);
    return { headers, startFen, positions, realms, ledger };
  }

  private findNearbyEnemies(
    chess: Chess,
    toSquare: string,
    moverColor: 'w' | 'b',
  ): NearbyEnemy[] {
    const board = chess.board();
    const file = toSquare.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = Number(toSquare[1]) - 1;
    const enemies: NearbyEnemy[] = [];

    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const dist = Math.max(Math.abs(f - file), Math.abs(r - rank));
        if (dist < 1 || dist > NEAR_DISTANCE) {
          continue;
        }
        const squarePiece = board[7 - r]?.[f];
        if (!squarePiece || squarePiece.color === moverColor) {
          continue;
        }
        const square = `${String.fromCharCode(97 + f)}${r + 1}` as Square;
        const piece = squarePiece.type;
        const enemy: NearbyEnemy = {
          piece,
          square,
          color: squarePiece.color,
          distance: dist,
        };
        if (piece === 'n' || piece === 'b' || piece === 'r') {
          enemy.wing = f < 4 ? 'Western' : 'Eastern';
        }
        enemies.push(enemy);
      }
    }

    enemies.sort(
      (a, b) => a.distance - b.distance || a.square.localeCompare(b.square),
    );
    return enemies;
  }

  private findTargetedEnemies(
    chess: Chess,
    fromSquare: string,
    moverColor: 'w' | 'b',
    piece: PieceCode,
  ): TargetedEnemy[] {
    const board = chess.board();
    const targets: TargetedEnemy[] = [];
    const value: Record<PieceCode, number> = {
      k: 6,
      q: 5,
      r: 4,
      b: 3,
      n: 3,
      p: 1,
    };

    for (const square of this.attackSquares(
      chess,
      fromSquare,
      piece,
      moverColor,
    )) {
      const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
      const rank = Number(square[1]) - 1;
      const squarePiece = board[7 - rank]?.[file];
      if (!squarePiece || squarePiece.color === moverColor) {
        continue;
      }
      const enemyPiece = squarePiece.type;
      const enemy: TargetedEnemy = {
        piece: enemyPiece,
        square,
        color: squarePiece.color,
      };
      if (enemyPiece === 'n' || enemyPiece === 'b' || enemyPiece === 'r') {
        enemy.wing = file < 4 ? 'Western' : 'Eastern';
      }
      targets.push(enemy);
    }

    targets.sort(
      (a, b) =>
        value[b.piece] - value[a.piece] || a.square.localeCompare(b.square),
    );
    return targets;
  }

  private attackSquares(
    chess: Chess,
    fromSquare: string,
    piece: PieceCode,
    color: 'w' | 'b',
  ): string[] {
    const file = fromSquare.charCodeAt(0) - 'a'.charCodeAt(0);
    const rank = Number(fromSquare[1]) - 1;
    const squares: string[] = [];

    const push = (f: number, r: number) => {
      if (f < 0 || f > 7 || r < 0 || r > 7) {
        return false;
      }
      squares.push(`${String.fromCharCode(97 + f)}${r + 1}`);
      const occ = chess.board()[7 - r]?.[f];
      return !occ;
    };

    const slide = (df: number, dr: number) => {
      let f = file + df;
      let r = rank + dr;
      while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
        const empty = push(f, r);
        if (!empty) {
          break;
        }
        f += df;
        r += dr;
      }
    };

    if (piece === 'n') {
      for (const [df, dr] of [
        [1, 2],
        [2, 1],
        [2, -1],
        [1, -2],
        [-1, -2],
        [-2, -1],
        [-2, 1],
        [-1, 2],
      ]) {
        const f = file + df;
        const r = rank + dr;
        if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
          squares.push(`${String.fromCharCode(97 + f)}${r + 1}`);
        }
      }
    } else if (piece === 'k') {
      for (let df = -1; df <= 1; df++) {
        for (let dr = -1; dr <= 1; dr++) {
          if (df === 0 && dr === 0) continue;
          const f = file + df;
          const r = rank + dr;
          if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
            squares.push(`${String.fromCharCode(97 + f)}${r + 1}`);
          }
        }
      }
    } else if (piece === 'p') {
      const dir = color === 'w' ? 1 : -1;
      for (const df of [-1, 1]) {
        const f = file + df;
        const r = rank + dir;
        if (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
          squares.push(`${String.fromCharCode(97 + f)}${r + 1}`);
        }
      }
    } else {
      if (piece === 'b' || piece === 'q') {
        slide(1, 1);
        slide(1, -1);
        slide(-1, 1);
        slide(-1, -1);
      }
      if (piece === 'r' || piece === 'q') {
        slide(1, 0);
        slide(-1, 0);
        slide(0, 1);
        slide(0, -1);
      }
    }

    return squares;
  }

  private buildRealms(headers: Record<string, string>): Realms {
    const realms: Realms = {
      white: 'Light Kingdom',
      black: 'Dark Kingdom',
    };

    const whiteName = headers['White'];
    const blackName = headers['Black'];
    if (whiteName && whiteName !== '?') {
      realms.whiteKingName = whiteName;
    }
    if (blackName && blackName !== '?') {
      realms.blackKingName = blackName;
    }

    return realms;
  }
}
