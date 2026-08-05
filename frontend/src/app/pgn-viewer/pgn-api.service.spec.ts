import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { PgnApiService } from './pgn-api.service';

describe('PgnApiService', () => {
  let api: PgnApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PgnApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(PgnApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('uses one status request and skips redundant post-story stages', () => {
    const states: string[] = [];
    api
      .generateSaga('game-1', (stage, state) =>
        states.push(`${stage}:${state}`),
      )
      .subscribe();

    http
      .expectOne('/api/games/game-1/pipeline-status')
      .flush({
        analysis: false,
        outline: false,
        story: false,
        validation: false,
        scenes: false,
      });
    http.expectOne('/api/games/game-1/analysis').flush({});
    http.expectOne('/api/games/game-1/outline').flush({});
    http.expectOne('/api/games/game-1/story').flush({
      status: 'COMPLETED',
      sceneBreakdown: { data: { scenes: [] } },
    });

    http.expectNone('/api/games/game-1/validation');
    http.expectNone('/api/games/game-1/scenes');
    expect(states).toContain('story:completed');
    expect(states).toContain('validation:completed');
    expect(states).toContain('scenes:completed');
  });

  it('loads completed scenes after reusing every stage', () => {
    const states: string[] = [];
    api
      .generateSaga('game-1', (stage, state) =>
        states.push(`${stage}:${state}`),
      )
      .subscribe();

    http
      .expectOne('/api/games/game-1/pipeline-status')
      .flush({
        analysis: true,
        outline: true,
        story: true,
        validation: true,
        scenes: true,
      });
    http.expectOne('/api/games/game-1/scenes').flush({
      status: 'COMPLETED',
      sceneBreakdown: { data: { scenes: [] } },
    });

    expect(states).toContain('analysis:reused');
    expect(states).toContain('outline:reused');
    expect(states).toContain('story:reused');
    expect(states).toContain('validation:reused');
    expect(states).toContain('scenes:reused');
  });

  it('shares one active generation across duplicate callers', () => {
    const first = api.generateSaga('game-1', () => undefined);
    const second = api.generateSaga('game-1', () => undefined);
    expect(second).toBe(first);
    first.subscribe();
    second.subscribe();

    http
      .expectOne('/api/games/game-1/pipeline-status')
      .flush({
        analysis: false,
        outline: false,
        story: false,
        validation: false,
        scenes: false,
      });
    http.expectOne('/api/games/game-1/analysis').flush({});
    http.expectOne('/api/games/game-1/outline').flush({});
    http.expectOne('/api/games/game-1/story').flush({
      status: 'COMPLETED',
      sceneBreakdown: { data: { scenes: [] } },
    });
  });
});
