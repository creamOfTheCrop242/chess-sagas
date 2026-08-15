import {
  FULL_STORY_INSTRUCTIONS,
  FULL_STORY_PROMPT_VERSION,
} from './full-story.prompt';
import {
  NARRATIVE_ANALYSIS_INSTRUCTIONS,
  NARRATIVE_ANALYSIS_PROMPT_VERSION,
} from '../narrative-analysis/narrative-analysis.prompt';
import {
  STORY_OUTLINE_INSTRUCTIONS,
  STORY_OUTLINE_PROMPT_VERSION,
} from '../story-outline/story-outline.prompt';

describe('plain-language story prompt contract', () => {
  it('plans stories in plain contemporary English from narrative analysis onward', () => {
    expect(NARRATIVE_ANALYSIS_PROMPT_VERSION).toBe('phase-2-v75');
    expect(NARRATIVE_ANALYSIS_INSTRUCTIONS).toContain(
      'plain contemporary English throughout the saga',
    );
    expect(NARRATIVE_ANALYSIS_INSTRUCTIONS).toContain(
      'what is physically done, why it is done, what immediately changes, and what it costs',
    );
  });

  it('prevents the outline from planning obscure poetic events', () => {
    expect(STORY_OUTLINE_PROMPT_VERSION).toBe('phase-3-v75');
    expect(STORY_OUTLINE_INSTRUCTIONS).toContain('plain modern English');
    expect(STORY_OUTLINE_INSTRUCTIONS).toContain(
      'Mystery may surround the ultimate origin or future of a threat, but never the action the reader just witnessed',
    );
  });

  it('requires final prose and endings to explain literal cause and effect', () => {
    expect(FULL_STORY_PROMPT_VERSION).toBe('story-package-v88');
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'plain modern English that a reader can understand on the first pass',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'state what that thing controlled and the practical result of the action',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'End when the concrete consequence is clear',
    );
  });
});
