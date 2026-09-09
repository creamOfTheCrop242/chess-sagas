import { BadRequestException, Injectable } from '@nestjs/common';
import { Chess } from 'chess.js';
import type { Color, Move, Square } from 'chess.js';
import type {
  ChessEvent,
  ChessPieceType,
  GameLedger,
  QuietBeatPurpose,
} from './models/game-ledger';
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
    const revengeDebts = new Map<
      string,
      Array<{ victimPieceId: string; killerPieceId: string; deathPly: number }>
    >();

    for (const historicalMove of history) {
      const ply = events.length + 1;
      const wasInCheck = replay.isCheck();
      const movingColor = replay.turn();
      const defendingKingSquare = wasInCheck
        ? replay.findPiece({ type: 'k', color: movingColor })[0]
        : undefined;
      const checkingPieceIds = defendingKingSquare
        ? replay
            .attackers(defendingKingSquare, movingColor === 'w' ? 'b' : 'w')
            .map((square) => squareToId.get(square))
            .filter((pieceId): pieceId is string => Boolean(pieceId))
        : [];
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
      const castlingFortressId = isCastle
        ? this.moveCastlingRook(squareToId, result.color, castleSide!)
        : undefined;

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
      const checkmateExplanation = isCheckmate
        ? this.explainCheckmate(replay, squareToId)
        : undefined;
      const tacticalContext = this.buildTacticalContext(
        replay,
        squareToId,
        result,
        capturedId,
        wasInCheck,
        checkingPieceIds,
      );
      const adjacentAllyPieceIds = adjacentSquares(result.to)
        .map((square) => squareToId.get(square))
        .filter((pieceId): pieceId is string => {
          const piece = pieceId ? byId.get(pieceId) : undefined;
          return Boolean(piece?.alive && piece.chessColor === mover.chessColor);
        });
      const avengesDeaths = capturedId
        ? (revengeDebts.get(moverId) ?? [])
            .filter((debt) => debt.killerPieceId === capturedId)
            .map(({ victimPieceId, deathPly }) => ({ victimPieceId, deathPly }))
        : [];
      const witnessPieceIds = captured
        ? this.captureWitnesses(
            replay,
            squareToId,
            byId,
            result.to,
            captured.chessColor,
          )
        : [];
      if (captured) {
        for (const witnessPieceId of witnessPieceIds) {
          const debts = revengeDebts.get(witnessPieceId) ?? [];
          debts.push({
            victimPieceId: captured.id,
            killerPieceId: mover.id,
            deathPly: ply,
          });
          revengeDebts.set(witnessPieceId, debts);
        }
      }
      events.push({
        ply,
        moveNumber: Math.ceil(ply / 2),
        side: result.color === 'w' ? 'north' : 'south',
        san: result.san,
        from: result.from,
        to: result.to,
        pieceId: mover.id,
        pieceType: this.identities.fantasyType(result.piece),
        archwizardTravelMode:
          this.identities.fantasyType(result.piece) === 'archwizard'
            ? distanceBasedTravelMode(result.from, result.to, 'teleport')
            : undefined,
        queenTravelMode:
          this.identities.fantasyType(result.piece) === 'queen'
            ? distanceBasedTravelMode(result.from, result.to, 'magical-rush')
            : undefined,
        knightCommanderTravelMode:
          this.identities.fantasyType(result.piece) === 'knight-commander'
            ? distanceBasedTravelMode(result.from, result.to, 'spectral-mount')
            : undefined,
        isCapture: Boolean(result.captured),
        capturedPieceId: captured?.id,
        capturedPieceType: captured?.fantasyType,
        isCheck,
        isCheckmate,
        isCastle,
        castleSide,
        castlingFortressId,
        isPromotion,
        promotionType: result.promotion
          ? this.identities.fantasyType(result.promotion)
          : undefined,
        isEnPassant,
        isQuietMove: !result.captured && !isCheck && !isCastle && !isPromotion,
        kingdomHeartContext: kingdomHeartContext(
          result.color,
          result.from,
          result.to,
        ),
        boardFenAfterMove: replay.fen(),
        tacticalContext,
        interactionContext: {
          adjacentAllyPieceIds,
          witnessedCapture: captured
            ? {
                victimPieceId: captured.id,
                killerPieceId: mover.id,
                witnessPieceIds,
              }
            : undefined,
          avengesDeaths,
        },
        checkmateExplanation,
      });
    }

    this.assignQuietBeatContexts(events, identitySeed);

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

  private captureWitnesses(
    chess: Chess,
    squareToId: Map<string, string>,
    byId: Map<string, GameLedger['pieces'][number]>,
    captureSquare: Square,
    victimColor: Color,
  ): string[] {
    const visibleSquares = new Set<Square>([
      ...adjacentSquares(captureSquare),
      ...chess.attackers(captureSquare, victimColor),
    ]);
    return [...visibleSquares]
      .map((square) => squareToId.get(square))
      .filter((pieceId): pieceId is string => {
        const piece = pieceId ? byId.get(pieceId) : undefined;
        return Boolean(piece?.alive && piece.chessColor === victimColor);
      })
      .sort();
  }

  private assignQuietBeatContexts(
    events: ChessEvent[],
    identitySeed: string,
  ): void {
    const isMajor = (event: ChessEvent) =>
      event.isCapture ||
      event.isCheck ||
      event.isPromotion ||
      event.isCastle ||
      event.isCheckmate;

    const recentPurposes: QuietBeatPurpose[] = [];

    for (const event of events) {
      if (!event.isQuietMove) continue;
      // Nearby in time does not imply that this character experienced the event.
      // Future links use direct participation only, never future witness knowledge.
      const involvesMover = (candidate: ChessEvent) =>
        candidate.pieceId === event.pieceId ||
        candidate.capturedPieceId === event.pieceId ||
        candidate.castlingFortressId === event.pieceId ||
        (event.pieceType === 'king' &&
          candidate.isCheck &&
          candidate.side !== event.side);
      const previousMajor = [...events]
        .reverse()
        .find(
          (candidate) =>
            candidate.ply < event.ply &&
            isMajor(candidate) &&
            (involvesMover(candidate) ||
              candidate.interactionContext?.witnessedCapture?.witnessPieceIds.includes(
                event.pieceId,
              )),
        );
      const nextMajor = events.find(
        (candidate) =>
          candidate.ply > event.ply &&
          isMajor(candidate) &&
          involvesMover(candidate),
      );
      const previousDistance = previousMajor
        ? event.ply - previousMajor.ply
        : Number.POSITIVE_INFINITY;
      const nextDistance = nextMajor
        ? nextMajor.ply - event.ply
        : Number.POSITIVE_INFINITY;
      const purposes: QuietBeatPurpose[] = [];
      const adjacentAllies =
        event.interactionContext?.adjacentAllyPieceIds ?? [];
      const tacticalPieces = [
        ...(event.tacticalContext?.attacksPieceIds ?? []),
        ...(event.tacticalContext?.attackedByPieceIds ?? []),
      ];

      if (previousDistance <= 2) purposes.push('aftermath-reaction');
      if (nextDistance <= 2) {
        purposes.push('approaching-danger', 'tactical-preparation');
      }
      if (tacticalPieces.length > 0) {
        purposes.push('threat-recognition', 'enemy-observation');
      }
      if (adjacentAllies.length > 0) {
        purposes.push('relationship-development', 'human-moment');
      }
      purposes.push(
        'environmental-pressure',
        'backstory-reflection',
        'meaningful-travel',
        'tactical-preparation',
      );

      const distinctPurposes = [...new Set(purposes)];
      const variedPurposes = distinctPurposes.filter(
        (candidate) => !recentPurposes.includes(candidate),
      );
      const eligiblePurposes =
        variedPurposes.length > 0 ? variedPurposes : distinctPurposes;
      // Prefer a relevant recent consequence once, not at the expense of all variety.
      const preferredPurposes = eligiblePurposes.includes('aftermath-reaction')
        ? ['aftermath-reaction' as QuietBeatPurpose]
        : eligiblePurposes;
      const purpose =
        preferredPurposes[
          stableIndex(
            `${identitySeed}|quiet-beat|${event.ply}|${event.pieceId}`,
            preferredPurposes.length,
          )
        ];
      const relatedEventPly =
        purpose === 'aftermath-reaction'
          ? previousMajor?.ply
          : ['approaching-danger', 'tactical-preparation'].includes(purpose) &&
              nextDistance <= 2
            ? nextMajor?.ply
            : undefined;
      const focusPieceIds = [
        event.pieceId,
        ...(purpose === 'relationship-development' || purpose === 'human-moment'
          ? adjacentAllies.slice(0, 2)
          : purpose === 'threat-recognition' || purpose === 'enemy-observation'
            ? tacticalPieces.slice(0, 2)
            : []),
      ];
      event.quietBeatContext = {
        purpose,
        relatedEventPly,
        focusPieceIds: [...new Set(focusPieceIds)],
      };
      recentPurposes.push(purpose);
      if (recentPurposes.length > 2) recentPurposes.shift();
    }
  }

  private buildTacticalContext(
    chess: Chess,
    squareToId: Map<string, string>,
    move: Move,
    capturedId: string | undefined,
    wasInCheck: boolean,
    checkingPieceIds: string[],
  ): NonNullable<GameLedger['events'][number]['tacticalContext']> {
    const enemyColor: Color = move.color === 'w' ? 'b' : 'w';
    const enemySquares = (['p', 'n', 'b', 'r', 'q', 'k'] as const).flatMap(
      (type) => chess.findPiece({ type, color: enemyColor }),
    );
    const attacksPieceIds = enemySquares
      .filter((square) => chess.attackers(square, move.color).includes(move.to))
      .map((square) => squareToId.get(square))
      .filter((pieceId): pieceId is string => Boolean(pieceId));
    const attackedByPieceIds = chess
      .attackers(move.to, enemyColor)
      .map((square) => squareToId.get(square))
      .filter((pieceId): pieceId is string => Boolean(pieceId));
    const checkResponse = !wasInCheck
      ? undefined
      : capturedId && checkingPieceIds.includes(capturedId)
        ? ('captures-checker' as const)
        : move.piece === 'k'
          ? ('king-escape' as const)
          : ('blocks-check' as const);
    return {
      attacksPieceIds,
      attackedByPieceIds,
      forkedPieceIds: attacksPieceIds.length >= 2 ? attacksPieceIds : [],
      checkResponse,
    };
  }

  private explainCheckmate(
    chess: Chess,
    squareToId: Map<string, string>,
  ): NonNullable<GameLedger['events'][number]['checkmateExplanation']> {
    const defender = chess.turn();
    const attacker: Color = defender === 'w' ? 'b' : 'w';
    const kingSquare = chess.findPiece({ type: 'k', color: defender })[0];
    const kingId = kingSquare ? squareToId.get(kingSquare) : undefined;
    if (!kingSquare || !kingId) {
      throw new BadRequestException('Unable to identify checkmated King');
    }
    const checkingSquares = chess.attackers(kingSquare, attacker);
    const checkingPieceIds = checkingSquares
      .map((square) => squareToId.get(square))
      .filter((pieceId): pieceId is string => Boolean(pieceId));
    return {
      kingId,
      kingSquare,
      checkingPieceIds,
      checkingSquares,
      escapeSquares: adjacentSquares(kingSquare).map((square) => {
        const occupant = chess.get(square);
        return {
          square,
          reason:
            occupant?.color === defender
              ? ('friendly-occupied' as const)
              : ('enemy-controlled' as const),
          occupiedByPieceId:
            occupant?.color === defender ? squareToId.get(square) : undefined,
          controlledByPieceIds: chess
            .attackers(square, attacker)
            .map((attackerSquare) => squareToId.get(attackerSquare))
            .filter((pieceId): pieceId is string => Boolean(pieceId)),
        };
      }),
      checkingPieces: checkingSquares.map((square) => ({
        pieceId: squareToId.get(square)!,
        square,
        kingCanReach: areAdjacent(kingSquare, square),
        protectedByPieceIds: chess
          .attackers(square, attacker)
          .map((protectorSquare) => squareToId.get(protectorSquare))
          .filter((pieceId): pieceId is string => Boolean(pieceId)),
      })),
      interpositionSquares:
        checkingSquares.length === 1
          ? squaresBetween(kingSquare, checkingSquares[0])
          : [],
      canCaptureCheckingPiece: false,
      canBlockCheck: false,
      legalResponseCount: 0,
    };
  }

  private moveCastlingRook(
    map: Map<string, string>,
    color: 'w' | 'b',
    side: 'king' | 'queen',
  ): string {
    const rank = color === 'w' ? '1' : '8';
    const from = `${side === 'king' ? 'h' : 'a'}${rank}`;
    const to = `${side === 'king' ? 'f' : 'd'}${rank}`;
    const rookId = map.get(from);
    if (!rookId)
      throw new BadRequestException('Missing castling rook identity');
    map.delete(from);
    map.set(to, rookId);
    return rookId;
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

function kingdomHeartContext(
  moverColor: 'w' | 'b',
  from: string,
  to: string,
): ChessEvent['kingdomHeartContext'] {
  const destinationKingdom = moverColor === 'w' ? 'south' : 'north';
  const distanceFromHeart =
    moverColor === 'w' ? 8 - Number(to[1]) : Number(to[1]) - 1;
  const previousDistance =
    moverColor === 'w' ? 8 - Number(from[1]) : Number(from[1]) - 1;
  return {
    destinationKingdom,
    distanceFromHeart,
    zone:
      distanceFromHeart === 0
        ? 'capital-heart'
        : distanceFromHeart <= 2
          ? 'inner-realm'
          : 'outer-realm',
    movedCloserToHeart: distanceFromHeart < previousDistance,
  };
}

function distanceBasedTravelMode<
  T extends 'teleport' | 'magical-rush' | 'spectral-mount',
>(from: string, to: string, longTravelMode: T): 'walk' | T {
  const fileDistance = Math.abs(from.charCodeAt(0) - to.charCodeAt(0));
  const rankDistance = Math.abs(Number(from[1]) - Number(to[1]));
  return Math.max(fileDistance, rankDistance) > 1 ? longTravelMode : 'walk';
}

function stableIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
}

function adjacentSquares(square: Square): Square[] {
  const file = square.charCodeAt(0) - 'a'.charCodeAt(0);
  const rank = Number(square[1]) - 1;
  const squares: Square[] = [];
  for (let fileOffset = -1; fileOffset <= 1; fileOffset += 1) {
    for (let rankOffset = -1; rankOffset <= 1; rankOffset += 1) {
      if (fileOffset === 0 && rankOffset === 0) continue;
      const targetFile = file + fileOffset;
      const targetRank = rank + rankOffset;
      if (
        targetFile >= 0 &&
        targetFile < 8 &&
        targetRank >= 0 &&
        targetRank < 8
      ) {
        squares.push(
          `${String.fromCharCode('a'.charCodeAt(0) + targetFile)}${targetRank + 1}` as Square,
        );
      }
    }
  }
  return squares;
}

function areAdjacent(first: Square, second: Square): boolean {
  return (
    Math.abs(first.charCodeAt(0) - second.charCodeAt(0)) <= 1 &&
    Math.abs(Number(first[1]) - Number(second[1])) <= 1
  );
}

function squaresBetween(first: Square, second: Square): Square[] {
  const fileDelta = second.charCodeAt(0) - first.charCodeAt(0);
  const rankDelta = Number(second[1]) - Number(first[1]);
  const aligned =
    fileDelta === 0 ||
    rankDelta === 0 ||
    Math.abs(fileDelta) === Math.abs(rankDelta);
  if (!aligned) return [];
  const fileStep = Math.sign(fileDelta);
  const rankStep = Math.sign(rankDelta);
  const distance = Math.max(Math.abs(fileDelta), Math.abs(rankDelta));
  const squares: Square[] = [];
  for (let step = 1; step < distance; step += 1) {
    squares.push(
      `${String.fromCharCode(first.charCodeAt(0) + fileStep * step)}${
        Number(first[1]) + rankStep * step
      }` as Square,
    );
  }
  return squares;
}
