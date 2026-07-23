import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';

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

    return this.prisma.game.create({
      data: {
        pgnHash,
        rawPgn: canonicalPgn,
        whitePlayer: parsed.ledger.metadata.whitePlayer,
        blackPlayer: parsed.ledger.metadata.blackPlayer,
        result: parsed.ledger.metadata.result,
        ledger: {
          create: {
            schemaVersion: 1,
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
