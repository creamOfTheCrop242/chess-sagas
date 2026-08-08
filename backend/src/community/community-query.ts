import { BadRequestException } from '@nestjs/common';

export interface SagaListQuery {
  cursor?: string;
  limit?: string;
  q?: string;
  creator?: string;
}

export interface ParsedSagaListQuery {
  cursor?: string;
  limit: number;
  q?: string;
  creator?: string;
}

export function parseSagaListQuery(query: SagaListQuery): ParsedSagaListQuery {
  const requestedLimit = query.limit ? Number(query.limit) : 20;
  if (!Number.isInteger(requestedLimit) || requestedLimit < 1) {
    throw new BadRequestException('limit must be a positive integer');
  }
  const q = query.q?.trim();
  if (q && q.length > 100) {
    throw new BadRequestException('q must be 100 characters or fewer');
  }
  return {
    cursor: query.cursor?.trim() || undefined,
    limit: Math.min(requestedLimit, 50),
    q: q || undefined,
    creator: query.creator?.trim().toLowerCase() || undefined,
  };
}
