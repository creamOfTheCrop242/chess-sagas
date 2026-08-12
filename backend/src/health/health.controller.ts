import { Controller, Get, Header } from '@nestjs/common';
import { HealthService, type HealthStatus } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  readiness(): Promise<HealthStatus> {
    return this.health.readiness();
  }
}
