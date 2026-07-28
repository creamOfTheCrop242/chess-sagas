import { BadRequestException, Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import type { Move } from 'chess.js';
import type { ChessPieceType, GameLedger } from './models/game-ledger';
import { PieceIdentityService } from './piece-identity.service';

@Injectable()
export class GameLedgerService {
  constructor(private readonly identities: PieceIdentityService) {}

  build(
    headers: Record<string, string>,
    history: Move[],
    initialFen: string,
  ): GameLedger {
    const replay = new Chess(initialFen);
    const identitySeed = [
      initialFen,
      headers.White ?? '',
      headers.Black ?? '',
      headers.Date ?? '',
      history.map((move) => move.san).join(' '),
    ].join('|');
    const { pieces, squareToId } = this.identities.create(replay, identitySeed);
    const byId = new Map(pieces.map((piece) => [piece.id, piece]));
    const events: GameLedger['events'] = [];
    const promotedPieces: string[] = [];

    for (const historicalMove of history) {
      const ply = events.length + 1;
      const moverId = squareToId.get(historicalMove.from);
      if (!moverId)
        throw new BadRequestException(
          `Missing piece identity at ${historicalMove.from}`,
        );
      const mover = byId.get(moverId)!;
      const result = replay.move(historicalMove.san);
      if (!result) throw new BadRequestException('Failed to replay PGN moves');

      const isEnPassant = result.flags.includes('e');
      const capturedSquare = isEnPassant
        ? `${result.to[0]}${result.from[1]}`
        : result.to;
      const capturedId = result.captured
        ? squareToId.get(capturedSquare)
        : undefined;
      const captured = capturedId ? byId.get(capturedId) : undefined;
      if (result.captured && !captured) {
        throw new BadRequestException(
          `Missing captured piece identity at ply ${ply}`,
        );
      }
      if (captured) {
        captured.alive = false;
        captured.capturedAtPly = ply;
        squareToId.delete(capturedSquare);
      }

      squareToId.delete(result.from);
      squareToId.set(result.to, moverId);

      const isCastle = result.flags.includes('k') || result.flags.includes('q');
      const castleSide = result.flags.includes('k')
        ? 'king'
        : result.flags.includes('q')
          ? 'queen'
          : undefined;
      if (isCastle)
        this.moveCastlingRook(squareToId, result.color, castleSide!);

      const isPromotion = Boolean(result.promotion);
      if (isPromotion) {
        mover.currentChessType = result.promotion as ChessPieceType;
        mover.fantasyType = this.identities.fantasyType(
          result.promotion as ChessPieceType,
        );
        mover.promotedFromPawnId = mover.id;
        promotedPieces.push(mover.id);
      }

      const isCheckmate = replay.isCheckmate();
      const isCheck = replay.isCheck();
      events.push({
        ply,
        moveNumber: Math.ceil(ply / 2),
        side: result.color === 'w' ? 'north' : 'south',
        san: result.san,
        from: result.from,
        to: result.to,
        pieceId: mover.id,
        pieceType: this.identities.fantasyType(result.piece),
        isCapture: Boolean(result.captured),
        capturedPieceId: captured?.id,
        capturedPieceType: captured?.fantasyType,
        isCheck,
        isCheckmate,
        isCastle,
        castleSide,
        isPromotion,
        promotionType: result.promotion
          ? this.identities.fantasyType(result.promotion)
          : undefined,
        isEnPassant,
        isQuietMove: !result.captured && !isCheck && !isCastle && !isPromotion,
        boardFenAfterMove: replay.fen(),
      });
    }

    return {
      metadata: this.metadata(headers, events.at(-1)?.isCheckmate ?? false),
      initialFen,
      finalFen: replay.fen(),
      pieces,
      events,
      survivors: pieces.filter((piece) => piece.alive).map((piece) => piece.id),
      capturedPieces: pieces
        .filter((piece) => !piece.alive)
        .map((piece) => piece.id),
      promotedPieces,
    };
  }

  private moveCastlingRook(
    map: Map<string, string>,
    color: 'w' | 'b',
    side: 'king' | 'queen',
  ): void {
    const rank = color === 'w' ? '1' : '8';
    const from = `${side === 'king' ? 'h' : 'a'}${rank}`;
    const to = `${side === 'king' ? 'f' : 'd'}${rank}`;
    const rookId = map.get(from);
    if (!rookId)
      throw new BadRequestException('Missing castling rook identity');
    map.delete(from);
    map.set(to, rookId);
  }

  private metadata(
    headers: Record<string, string>,
    checkmate: boolean,
  ): GameLedger['metadata'] {
    const result = (
      ['1-0', '0-1', '1/2-1/2', '*'].includes(headers.Result)
        ? headers.Result
        : '*'
    ) as GameLedger['metadata']['result'];
    const terminationText = (headers.Termination ?? '').toLowerCase();
    const termination = checkmate
      ? 'checkmate'
      : result === '1/2-1/2'
        ? 'draw'
        : terminationText.includes('time')
          ? 'timeout'
          : terminationText.includes('resign')
            ? 'resignation'
            : result === '1-0' || result === '0-1'
              ? 'resignation'
              : 'unknown';
    const number = (value?: string) =>
      value && /^\d+$/.test(value) ? Number(value) : undefined;
    return {
      date: headers.Date,
      whitePlayer: headers.White || 'Unknown',
      blackPlayer: headers.Black || 'Unknown',
      whiteElo: number(headers.WhiteElo),
      blackElo: number(headers.BlackElo),
      result,
      termination,
    };
  }
}
