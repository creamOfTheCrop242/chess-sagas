import { Module } from '@nestjs/common';
import { FULL_STORY_PROVIDER } from './full-story.provider';
import { FullStoryController } from './full-story.controller';
import { FullStoryService } from './full-story.service';
import { FullStoryValidator } from './full-story.validator';
import { OpenAiFullStoryProvider } from './openai-full-story.provider';
import { SceneBreakdownValidator } from '../scene-breakdown/scene-breakdown.validator';
import { DeterministicStoryValidator } from '../story-validation/deterministic-story.validator';

@Module({
  controllers: [FullStoryController],
  providers: [
    FullStoryService,
    FullStoryValidator,
    SceneBreakdownValidator,
    DeterministicStoryValidator,
    {
      provide: FULL_STORY_PROVIDER,
      useClass: OpenAiFullStoryProvider,
    },
  ],
})
export class FullStoryModule {}
