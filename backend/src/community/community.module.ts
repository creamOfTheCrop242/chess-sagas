import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { BillingModule } from '../billing/billing.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { SagasController } from './sagas.controller';
import { SagasService } from './sagas.service';

@Module({
  imports: [AuthModule, BillingModule],
  controllers: [SagasController, ProfilesController],
  providers: [SagasService, ProfilesService],
})
export class CommunityModule {}
