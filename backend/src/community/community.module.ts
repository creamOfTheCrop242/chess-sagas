import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ProfilesController } from './profiles.controller';
import { ProfilesService } from './profiles.service';
import { SagasController } from './sagas.controller';
import { SagasService } from './sagas.service';

@Module({
  imports: [AuthModule],
  controllers: [SagasController, ProfilesController],
  providers: [SagasService, ProfilesService],
})
export class CommunityModule {}
