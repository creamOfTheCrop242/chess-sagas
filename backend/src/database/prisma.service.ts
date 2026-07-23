import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('DATABASE_URL is not configured');
    }

    const url = new URL(connectionString);
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
    const adapter = new PrismaPg({
      connectionString,
      ssl: isLocal ? false : { rejectUnauthorized: false },
    });
    super({ adapter });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
