import { Module } from '@nestjs/common';
import { FullStoryModule } from '../full-story/full-story.module';
import { NarrativeAnalysisModule } from '../narrative-analysis/narrative-analysis.module';
import { SceneBreakdownModule } from '../scene-breakdown/scene-breakdown.module';
import { StoryOutlineModule } from '../story-outline/story-outline.module';
import { StoryValidationModule } from '../story-validation/story-validation.module';
import { SagaGenerationController } from './saga-generation.controller';
import { SagaGenerationService } from './saga-generation.service';

@Module({
  imports: [
    NarrativeAnalysisModule,
    StoryOutlineModule,
    FullStoryModule,
    StoryValidationModule,
    SceneBreakdownModule,
  ],
  controllers: [SagaGenerationController],
  providers: [SagaGenerationService],
})
export class SagaGenerationModule {}
