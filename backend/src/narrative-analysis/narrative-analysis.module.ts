import { Module } from '@nestjs/common';
import { NARRATIVE_ANALYSIS_PROVIDER } from './llm-provider';
import { NarrativeAnalysisController } from './narrative-analysis.controller';
import { NarrativeAnalysisService } from './narrative-analysis.service';
import { NarrativeAnalysisValidator } from './narrative-analysis.validator';
import { OpenAiNarrativeAnalysisProvider } from './openai-narrative-analysis.provider';

@Module({
  controllers: [NarrativeAnalysisController],
  providers: [
    NarrativeAnalysisService,
    NarrativeAnalysisValidator,
    {
      provide: NARRATIVE_ANALYSIS_PROVIDER,
      useClass: OpenAiNarrativeAnalysisProvider,
    },
  ],
  exports: [NarrativeAnalysisService],
})
export class NarrativeAnalysisModule {}
