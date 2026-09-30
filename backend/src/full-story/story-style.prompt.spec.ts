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
import { STORY_VALIDATION_INSTRUCTIONS } from '../story-validation/story-validation.prompt';
import { SCENE_BREAKDOWN_INSTRUCTIONS } from '../scene-breakdown/scene-breakdown.prompt';
import { CHECKMATE_STAGING_INSTRUCTIONS } from './checkmate-chronology';

describe('plain-language story prompt contract', () => {
  it('demonstrates mate through action and keeps quiet pacing nonblocking', () => {
    expect(FULL_STORY_INSTRUCTIONS).toContain(CHECKMATE_STAGING_INSTRUCTIONS);
    expect(FULL_STORY_INSTRUCTIONS).not.toContain('or interpose');
    expect(FULL_STORY_INSTRUCTIONS).not.toContain(
      'Each quiet beat must change',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'authorOnlyDirection.characterFocus',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain('not a compulsory dramatic turn');
    expect(STORY_OUTLINE_INSTRUCTIONS).toContain(
      'never invent combat, injury, death, or knowledge',
    );
  });
  it('permits mounted or foot combat consistently without teleporting', () => {
    for (const instructions of [
      NARRATIVE_ANALYSIS_INSTRUCTIONS,
      STORY_OUTLINE_INSTRUCTIONS,
      FULL_STORY_INSTRUCTIONS,
      STORY_VALIDATION_INSTRUCTIONS,
      SCENE_BREAKDOWN_INSTRUCTIONS,
    ]) {
      expect(instructions).toContain('mounted or on foot');
      expect(instructions).toContain('remount');
      expect(instructions).toContain('artifact');
      expect(instructions).not.toContain('transportation only');
      expect(instructions).not.toContain('must dismount');
    }
  });
  it('separates connective beats from featured turns without new blocking rules', () => {
    for (const instructions of [
      NARRATIVE_ANALYSIS_INSTRUCTIONS,
      STORY_OUTLINE_INSTRUCTIONS,
    ]) {
      expect(instructions).toContain(
        'brief connective beats from featured character beats',
      );
      expect(instructions).toContain('non-blocking writing preferences');
    }
    expect(STORY_OUTLINE_INSTRUCTIONS).toContain(
      'optional author guidance, not a validation gate',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain('1–2 clear sentences');
    expect(FULL_STORY_INSTRUCTIONS).not.toContain(
      'Each fantasyNarration should usually contain 2–4',
    );
  });
  it('requires purposeful dialogue without logistical filler', () => {
    for (const instructions of [
      STORY_OUTLINE_INSTRUCTIONS,
      FULL_STORY_INSTRUCTIONS,
    ]) {
      expect(instructions).toContain(
        'Dialogue needs a dramatic purpose, not merely simpler words',
      );
      expect(instructions).toContain('never logistical filler');
      expect(instructions).toContain('silence instead');
      expect(instructions).toContain('a concrete environmental observation');
      expect(instructions).toContain(
        'fear, memory, resentment, hope, or judgment',
      );
    }
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'cut it if nothing meaningful changes',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain('Do not invent a supply crisis');
  });
  it('plans stories in plain contemporary English from narrative analysis onward', () => {
    expect(NARRATIVE_ANALYSIS_PROMPT_VERSION).toBe('phase-2-v90');
    expect(NARRATIVE_ANALYSIS_INSTRUCTIONS).toContain(
      'plain contemporary English throughout the saga',
    );
    expect(NARRATIVE_ANALYSIS_INSTRUCTIONS).toContain(
      'Use no atmospheric or poetic narration',
    );
    expect(NARRATIVE_ANALYSIS_INSTRUCTIONS).toContain(
      'what is physically done, why it is done, what immediately changes, and what it costs',
    );
  });

  it('prevents the outline from planning obscure poetic events', () => {
    expect(STORY_OUTLINE_PROMPT_VERSION).toBe('phase-3-v96');
    expect(STORY_OUTLINE_INSTRUCTIONS).toContain('plain modern English');
    expect(STORY_OUTLINE_INSTRUCTIONS).toContain(
      'Mystery may surround the ultimate origin or future of a threat, but never the action the reader just witnessed',
    );
  });

  it('requires final prose and endings to explain literal cause and effect', () => {
    expect(FULL_STORY_PROMPT_VERSION).toBe('story-package-v116');
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'plain modern English that a reader can understand on the first pass',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'Use no atmospheric or poetic narration',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'state what that thing controlled and the practical result of the action',
    );
    expect(FULL_STORY_INSTRUCTIONS).toContain(
      'End when the concrete consequence is clear',
    );
  });
});
