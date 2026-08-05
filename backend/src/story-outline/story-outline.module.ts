import { Module } from '@nestjs/common';
import { OpenAiStoryOutlineProvider } from './openai-story-outline.provider';
import { StoryOutlineController } from './story-outline.controller';
import { StoryOutlineService } from './story-outline.service';
import { STORY_OUTLINE_PROVIDER } from './story-outline.provider';
import { StoryOutlineValidator } from './story-outline.validator';

@Module({
  controllers: [StoryOutlineController],
  providers: [
    StoryOutlineService,
    StoryOutlineValidator,
    {
      provide: STORY_OUTLINE_PROVIDER,
      useClass: OpenAiStoryOutlineProvider,
    },
  ],
  exports: [StoryOutlineService],
})
export class StoryOutlineModule {}
