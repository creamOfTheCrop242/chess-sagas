import { NotFoundException } from '@nestjs/common';
import { GameLedgerService } from '../chess/game-ledger.service';
import { PieceIdentityService } from '../chess/piece-identity.service';
import type { PrismaService } from '../database/prisma.service';
import { PgnService } from '../pgn/pgn.service';
import { GenerationPreparationService } from './generation-preparation.service';

describe('GenerationPreparationService', () => {
  const ledger = new PgnService(
    new GameLedgerService(new PieceIdentityService()),
  ).parse(
    '[White "Ada"]\n[Black "Turing"]\n[Result "0-1"]\n\n1. f3 e5 2. g4 Qh4# 0-1',
  ).ledger;
  const findUnique = jest.fn();
  const prisma = {
    game: { findUnique },
  } as unknown as PrismaService;

  beforeEach(() => {
    jest.clearAllMocks();
    findUnique.mockResolvedValue({ ledger: { data: ledger } });
  });

  it('reuses normalized deterministic preparation across pipeline stages', async () => {
    const service = new GenerationPreparationService(prisma);

    const first = await service.prepare('game-1');
    const second = await service.prepare('game-1');

    expect(second).toBe(first);
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(first.ledger.pieces).toEqual(ledger.pieces);
    expect(first.battlefieldEnvironment).toBeDefined();
    expect(first.requiredWoundEvents).toBeDefined();
  });

  it('coalesces simultaneous preparation requests', async () => {
    const service = new GenerationPreparationService(prisma);

    const [first, second] = await Promise.all([
      service.prepare('game-1'),
      service.prepare('game-1'),
    ]);

    expect(first).toBe(second);
    expect(findUnique).toHaveBeenCalledTimes(1);
  });

  it('reloads preparation after explicit invalidation', async () => {
    const service = new GenerationPreparationService(prisma);

    await service.prepare('game-1');
    service.invalidate('game-1');
    await service.prepare('game-1');

    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('does not cache a missing or failed ledger lookup', async () => {
    const service = new GenerationPreparationService(prisma);
    findUnique.mockResolvedValueOnce(null);

    await expect(service.prepare('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.prepare('missing')).resolves.toBeDefined();
    expect(findUnique).toHaveBeenCalledTimes(2);
  });

  it('coalesces duplicate stage generation across callers', async () => {
    const service = new GenerationPreparationService(prisma);
    let finish!: (value: string) => void;
    const work = jest.fn(
      () =>
        new Promise<string>((resolve) => {
          finish = resolve;
        }),
    );

    const first = service.runStageOnce('game-1', 'STORY', work);
    const second = service.runStageOnce('game-1', 'STORY', work);
    finish('complete');

    await expect(Promise.all([first, second])).resolves.toEqual([
      'complete',
      'complete',
    ]);
    expect(work).toHaveBeenCalledTimes(1);
  });
});
