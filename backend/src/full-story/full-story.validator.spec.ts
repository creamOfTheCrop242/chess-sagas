import { BadGatewayException } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { SceneBreakdown } from '../scene-breakdown/models/scene-breakdown';
import type { GeneratedStoryDraft } from './models/generated-story';
import {
  assembleStoryMarkdown,
  expectedDefeatedKingFate,
} from './full-story.service';
import { FullStoryValidator } from './full-story.validator';

describe('FullStoryValidator', () => {
  const ledger = {
    pieces: [{ id: 'w-q-d1' }, { id: 'b-p-f7' }],
  } as GameLedger;
  const outline = {
    selectedTitle: 'The Seven-Stroke Sealfall',
  } as StoryOutline;
  const story: GeneratedStoryDraft = {
    title: 'The Seven-Stroke Sealfall',
    storyMarkdown: `## Act I — The Mirrored Challenge

The northern company advanced beneath pale banners while a southern host answered across the scarred plain. Neither formation drew blood; their measured steps only widened the road behind them.

## Act II — The Hidden Line

The Northeast Archwizard climbed the broken ridge and cast a silent lattice toward the distant royal ward. Far away, the Northern Queen felt the path open and drew her blade without yet striking.

## Act III — The Queen's Challenge

She entered beneath a storm of her own making, armored in light dense enough to turn a fortress blow. A Knight Commander rushed to bar her approach, but the champion passed beyond his reach without harming him.

## Act IV — The Seven-Stroke Sealfall

At the ward, the Queen met the defending company with blade and spell together. Her sword broke their shield wall as her magic burned through the binding sigils, and the company fell beneath the only mortal stroke of the brief war. The Archwizard's distant lattice held the path behind her.

The Southern King poured his strength into the Royal Seal, but every remaining road demanded that he abandon either his life or the realm bound to him. The seal fractured above a court that still lived yet could no longer fight. In the silence, the Queen lowered her blood-darkened sword while the storm carried the kingdom's broken light into the night.`,
  };

  it('accepts structurally valid continuous prose', () => {
    expect(() =>
      new FullStoryValidator().validate(story, ledger, outline),
    ).not.toThrow();
  });

  it('defers prose terminology repair to Phase 5', () => {
    expect(() =>
      new FullStoryValidator().validate(
        {
          ...story,
          storyMarkdown: `${story.storyMarkdown}\nThe w-q-d1 returned to f7.`,
        },
        ledger,
        outline,
      ),
    ).not.toThrow();
  });

  it('rejects a title that contradicts the validated outline', () => {
    expect(() =>
      new FullStoryValidator().validate(
        { ...story, title: 'A Different Story' },
        ledger,
        outline,
      ),
    ).toThrow(BadGatewayException);
  });

  it('assembles one continuous story from ordered playback scenes', () => {
    const scenes = [
      {
        actNumber: 1,
        fantasyNarration: 'The armies entered the rain-dark valley.',
      },
      {
        actNumber: 1,
        fantasyNarration: 'Mara answered the distant horn with a warning.',
      },
      {
        actNumber: 2,
        fantasyNarration: 'At dawn, the ruined gate finally gave way.',
      },
    ] as SceneBreakdown['scenes'];

    expect(assembleStoryMarkdown(scenes, ['Gathering Storm', 'The Gate'])).toBe(
      [
        '## Act 1: Gathering Storm',
        'The armies entered the rain-dark valley.',
        'Mara answered the distant horn with a warning.',
        '## Act 2: The Gate',
        'At dawn, the ruined gate finally gave way.',
      ].join('\n\n'),
    );
  });

  it('allows sanitized act titles to be assembled without coordinates', () => {
    const scenes = [
      {
        actNumber: 1,
        fantasyNarration: 'The company crossed the broken valley.',
      },
    ] as SceneBreakdown['scenes'];
    const markdown = assembleStoryMarkdown(scenes, ['The E4 Ambush']);

    expect(markdown).toContain('## Act 1: The battlefield Ambush');
    expect(markdown).not.toMatch(/\b[a-h][1-8]\b/i);
  });

  it('maps termination to the required defeated King fate', () => {
    expect(expectedDefeatedKingFate('checkmate')).toBe(
      'killed-after-checkmate',
    );
    expect(expectedDefeatedKingFate('resignation')).toBe(
      'suicide-after-surrender',
    );
    expect(expectedDefeatedKingFate('draw')).toBe('survives');
    expect(expectedDefeatedKingFate('timeout')).toBe('survives');
    expect(expectedDefeatedKingFate('unknown')).toBe('survives');
  });
});
