import { Global, Module } from '@nestjs/common';
import { GenerationPreparationService } from './generation-preparation.service';

@Global()
@Module({
  providers: [GenerationPreparationService],
  exports: [GenerationPreparationService],
})
export class GenerationModule {}
