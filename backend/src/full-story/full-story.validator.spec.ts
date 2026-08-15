import { BadGatewayException } from '@nestjs/common';
import type { GameLedger } from '../chess/models/game-ledger';
import type { StoryOutline } from '../story-outline/models/story-outline';
import type { SceneBreakdown } from '../scene-breakdown/models/scene-breakdown';
import type { GeneratedStoryDraft } from './models/generated-story';
import {
  assembleStoryMarkdown,
  buildCaptureManifest,
  buildStoryCorrectionFeedback,
  isAllowedDefeatedKingFate,
  isCorrectableStoryPackageError,
} from './full-story.service';
import {
  kingDiesFromFate,
  sealFateForKingFate,
} from '../chess/models/story-ending';
import { FullStoryValidator } from './full-story.validator';

describe('FullStoryValidator', () => {
  const ledger = {
    pieces: [{ id: 'w-q-d1' }, { id: 'b-p-f7' }],
  } as GameLedger;
  const outline = {
    selectedTitle: 'The Battle Under the Hollow Sky',
  } as StoryOutline;
  const story: GeneratedStoryDraft = {
    title: 'The Battle Under the Hollow Sky',
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

  it('appends immediate and later aftermaths after the final scene', () => {
    const scenes = [
      {
        actNumber: 1,
        fantasyNarration: 'The final banner fell into the rain.',
      },
    ] as SceneBreakdown['scenes'];
    const markdown = assembleStoryMarkdown(
      scenes,
      ['The Last Assault'],
      'At dawn, the survivors carried their dead home.',
      'Seven Years Later',
      'A traveler found pale magic beneath the old road.',
    );

    expect(markdown).toContain(
      'The final banner fell into the rain.\n\n## Immediate Aftermath\n\nAt dawn',
    );
    expect(markdown).toContain(
      '## Seven Years Later\n\nA traveler found pale magic',
    );
  });

  it('allows only termination-appropriate defeated King fates', () => {
    expect(
      isAllowedDefeatedKingFate('checkmate', 'killed-after-checkmate'),
    ).toBe(true);
    expect(
      isAllowedDefeatedKingFate(
        'resignation',
        'breaks-seal-and-accepts-captivity',
      ),
    ).toBe(true);
    expect(
      isAllowedDefeatedKingFate(
        'resignation',
        'executed-after-rejected-surrender',
      ),
    ).toBe(true);
    expect(isAllowedDefeatedKingFate('draw', 'survives')).toBe(true);
    expect(isAllowedDefeatedKingFate('draw', 'killed-after-checkmate')).toBe(
      false,
    );
  });

  it('maps each surrender outcome to coherent King and Seal states', () => {
    expect(sealFateForKingFate('breaks-seal-and-accepts-captivity')).toBe(
      'destroyed',
    );
    expect(
      sealFateForKingFate('refuses-seal-destruction-and-is-imprisoned'),
    ).toBe('intact');
    expect(kingDiesFromFate('executed-after-rejected-surrender')).toBe(true);
    expect(kingDiesFromFate('abandons-seal-and-flees')).toBe(false);
  });

  it('targets deterministic story-package errors for one correction retry', () => {
    const error =
      'Generated story package contains capture attribution errors: Edric must kill Northeast Fortress at ply 66, but the prose reverses the captor and victim. Rejected prose: "The fortress crushed Edric."';

    expect(isCorrectableStoryPackageError(error)).toBe(true);
    expect(isCorrectableStoryPackageError('OpenAI request timed out')).toBe(
      false,
    );
    expect(buildStoryCorrectionFeedback(error)).toContain(
      'the actor kills the victim, never the reverse',
    );
    expect(buildStoryCorrectionFeedback(error)).toContain(error);
  });

  it('retries a story that omits a selected verified revenge payoff', () => {
    const error =
      "Generated story package omits verified revenge payoffs: King Roderic's capture at ply 8 avenges Queen Isolde's witnessed death at ply 7, but the prose does not connect the payoff to that victim.";

    expect(isCorrectableStoryPackageError(error)).toBe(true);
    expect(buildStoryCorrectionFeedback(error)).toContain(
      'explicitly name the fallen ally',
    );
    expect(buildStoryCorrectionFeedback(error)).toContain(
      'the emotional reason for the capture, not its victim',
    );
  });

  it('builds an explicit capture manifest from ledger identities', () => {
    const captureLedger = {
      pieces: [
        {
          id: 'w-p-e2',
          permanentName: 'Northern Ember Company',
          viewpointName: 'Aric',
        },
        {
          id: 'b-p-d7',
          permanentName: 'Southern Briar Company',
          viewpointName: 'Tarin',
        },
      ],
      events: [
        {
          ply: 63,
          isCapture: true,
          pieceId: 'w-p-e2',
          capturedPieceId: 'b-p-d7',
        },
      ],
    } as GameLedger;

    expect(buildCaptureManifest(captureLedger)).toEqual([
      {
        ply: 63,
        actorId: 'w-p-e2',
        actorNames: ['Aric', 'Northern Ember Company'],
        victimId: 'b-p-d7',
        victimNames: ['Tarin', 'Southern Briar Company'],
        requiredOutcome: 'Aric kills Tarin; Tarin must not kill Aric.',
      },
    ]);
  });
});
