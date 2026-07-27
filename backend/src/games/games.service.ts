import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';

export const GAME_LEDGER_SCHEMA_VERSION = 2;

@Injectable()
export class GamesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pgn: PgnService,
  ) {}

  async create(rawPgn: string) {
    const parsed = this.pgn.parse(rawPgn);
    const canonicalPgn = rawPgn.trim();
    const pgnHash = createHash('sha256').update(canonicalPgn).digest('hex');
    const ledgerData = JSON.parse(
      JSON.stringify(parsed.ledger),
    ) as Prisma.InputJsonValue;
    const existing = await this.prisma.game.findFirst({
      where: { pgnHash },
      orderBy: { createdAt: 'desc' },
      include: { ledger: true },
    });
    if (existing) {
      if (
        existing.ledger &&
        existing.ledger.schemaVersion < GAME_LEDGER_SCHEMA_VERSION
      ) {
        const ledger = await this.prisma.gameLedger.update({
          where: { gameId: existing.id },
          data: {
            schemaVersion: GAME_LEDGER_SCHEMA_VERSION,
            initialFen: parsed.ledger.initialFen,
            finalFen: parsed.ledger.finalFen,
            data: ledgerData,
          },
        });
        return { ...existing, ledger };
      }
      return existing;
    }

    return this.prisma.game.create({
      data: {
        pgnHash,
        rawPgn: canonicalPgn,
        whitePlayer: parsed.ledger.metadata.whitePlayer,
        blackPlayer: parsed.ledger.metadata.blackPlayer,
        result: parsed.ledger.metadata.result,
        ledger: {
          create: {
            schemaVersion: GAME_LEDGER_SCHEMA_VERSION,
            initialFen: parsed.ledger.initialFen,
            finalFen: parsed.ledger.finalFen,
            data: ledgerData,
          },
        },
      },
      include: { ledger: true },
    });
  }

  findAll() {
    return this.prisma.game.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        whitePlayer: true,
        blackPlayer: true,
        result: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async findOne(id: string) {
    const game = await this.prisma.game.findUnique({
      where: { id },
      include: {
        ledger: true,
        generationRuns: {
          include: {
            narrativeAnalysis: true,
            storyOutline: true,
            generatedStory: true,
            storyValidation: true,
            sceneBreakdown: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!game) {
      throw new NotFoundException(`Game ${id} was not found`);
    }
    return game;
  }
}
