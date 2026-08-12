import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

export interface HealthStatus {
  status: 'ok';
  checks: { api: 'ok'; database: 'ok' };
  timestamp: string;
}

@Injectable()
export class HealthService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(): Promise<HealthStatus> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new ServiceUnavailableException({
        status: 'unavailable',
        checks: { api: 'ok', database: 'unavailable' },
        timestamp: new Date().toISOString(),
      });
    }

    return {
      status: 'ok',
      checks: { api: 'ok', database: 'ok' },
      timestamp: new Date().toISOString(),
    };
  }
}
