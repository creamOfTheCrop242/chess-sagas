import { BadGatewayException, Injectable } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { GeneratedStoryDraft } from './models/generated-story';

@Injectable()
export class FullStoryValidator {
  validate(
    story: GeneratedStoryDraft,
    ledger: GameLedger,
    outline: StoryOutline,
  ): void {
    const errors: string[] = [];
    if (story.title !== outline.selectedTitle) {
      errors.push('Story title must match the validated outline');
    }
    if (!/^##? Act\b/im.test(story.storyMarkdown)) {
      errors.push('Story must contain Markdown act headings');
    }
    if (/\b[a-h][1-8]\b/i.test(story.storyMarkdown)) {
      errors.push('Story prose contains a board coordinate');
    }
    if (
      /\b(?:SAN|FEN|checkmate|chess|ply|plies)\b/i.test(story.storyMarkdown)
    ) {
      errors.push('Story prose contains prohibited chess terminology');
    }
    const leakedPieceId = ledger.pieces.find((piece) =>
      story.storyMarkdown.includes(piece.id),
    );
    if (leakedPieceId) {
      errors.push(`Story prose exposes piece ID ${leakedPieceId.id}`);
    }
    if (errors.length) {
      throw new BadGatewayException(
        `Generated story failed structural validation: ${errors.join('; ')}`,
      );
    }
  }
}
