import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { GeneratedStoryDraft } from './models/generated-story';

@Injectable()
export class FullStoryValidator {
  validate(
    story: GeneratedStoryDraft,
    _ledger: GameLedger,
    outline: StoryOutline,
  ): void {
    const errors: string[] = [];
    if (story.title !== outline.selectedTitle) {
      errors.push('Story title must match the validated outline');
    }
    if (!/^##? Act\b/im.test(story.storyMarkdown)) {
      errors.push('Story must contain Markdown act headings');
    }
    if (errors.length) {
      throw new BadGatewayException(
        `Generated story failed structural validation: ${errors.join('; ')}`,
      );
    }
  }
}
