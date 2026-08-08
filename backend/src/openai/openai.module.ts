import { Global, Module } from '@nestjs/common';
import { OpenAiTelemetryService } from './openai-telemetry.service';

@Global()
@Module({
  providers: [OpenAiTelemetryService],
  exports: [OpenAiTelemetryService],
})
export class OpenAiModule {}
