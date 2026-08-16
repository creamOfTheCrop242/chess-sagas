import { Module } from '@nestjs/common';
import { DeterministicStoryValidator } from './deterministic-story.validator';
import { OpenAiStoryValidationProvider } from './openai-story-validation.provider';
import { STORY_VALIDATION_PROVIDER } from './story-validation.provider';
import { StoryValidationController } from './story-validation.controller';
import { StoryValidationService } from './story-validation.service';
import { SceneBreakdownValidator } from '../scene-breakdown/scene-breakdown.validator';

@Module({
  controllers: [StoryValidationController],
  providers: [
    StoryValidationService,
    DeterministicStoryValidator,
    SceneBreakdownValidator,
    {
      provide: STORY_VALIDATION_PROVIDER,
      useClass: OpenAiStoryValidationProvider,
    },
  ],
  exports: [StoryValidationService],
})
export class StoryValidationModule {}
