import { Module } from '@nestjs/common';
import { FULL_STORY_PROVIDER } from './full-story.provider';
import { FullStoryController } from './full-story.controller';
import { FullStoryService } from './full-story.service';
import { FullStoryValidator } from './full-story.validator';
import { OpenAiFullStoryProvider } from './openai-full-story.provider';

@Module({
  controllers: [FullStoryController],
  providers: [
    FullStoryService,
    FullStoryValidator,
    {
      provide: FULL_STORY_PROVIDER,
      useClass: OpenAiFullStoryProvider,
    },
  ],
})
export class FullStoryModule {}
