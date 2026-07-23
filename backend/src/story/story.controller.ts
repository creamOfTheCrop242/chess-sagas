import { Body, Controller, Post } from '@nestjs/common';
import { NarrateStoryDto } from './dto/narrate-story.dto';
import { StoryService } from './story.service';

@Controller('story')
export class StoryController {
  constructor(private readonly storyService: StoryService) {}

  @Post('narrate')
  narrate(@Body() body: NarrateStoryDto) {
    return this.storyService.narrate(body);
  }
}
