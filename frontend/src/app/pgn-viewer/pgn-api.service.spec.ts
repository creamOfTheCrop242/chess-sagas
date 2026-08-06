import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { of } from 'rxjs';
import { PgnApiService } from './pgn-api.service';
import { SagaPushNotificationService } from './saga-push-notification.service';

describe('PgnApiService', () => {
  let api: PgnApiService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PgnApiService,
        {
          provide: SagaPushNotificationService,
          useValue: { subscriptionForSaga: () => of(null) },
        },
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    api = TestBed.inject(PgnApiService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('starts one background job and polls until its scenes are ready', fakeAsync(() => {
    const states: string[] = [];
    let completed = false;
    api
      .generateSaga('game-1', (stage, state) =>
        states.push(`${stage}:${state}`),
      )
      .subscribe(() => {
        completed = true;
      });

    const start = http.expectOne('/api/games/game-1/generation');
    expect(start.request.body).toEqual({ pushSubscription: null });
    start.flush({
      state: 'queued',
      currentStage: 'analysis',
      error: null,
      stages: emptyStages,
    });
    tick(0);
    http.expectOne('/api/games/game-1/generation').flush({
      state: 'running',
      currentStage: 'analysis',
      error: null,
      stages: emptyStages,
    });
    expect(states).toContain('analysis:generating');

    tick(2_000);
    http.expectOne('/api/games/game-1/generation').flush({
      state: 'completed',
      currentStage: 'scenes',
      error: null,
      stages: completedStages,
    });
    http.expectOne('/api/games/game-1/scenes').flush({
      status: 'COMPLETED',
      sceneBreakdown: { data: { scenes: [] } },
    });

    expect(completed).toBeTrue();
    expect(states).toContain('analysis:completed');
    expect(states).toContain('validation:completed');
    expect(states).toContain('scenes:completed');
  }));

  it('loads completed scenes without restarting reusable work', fakeAsync(() => {
    const states: string[] = [];
    api
      .generateSaga('game-1', (stage, state) =>
        states.push(`${stage}:${state}`),
      )
      .subscribe();

    http.expectOne('/api/games/game-1/generation').flush({
      state: 'completed',
      currentStage: 'scenes',
      error: null,
      stages: completedStages,
    });
    tick(0);
    http.expectOne('/api/games/game-1/generation').flush({
      state: 'completed',
      currentStage: 'scenes',
      error: null,
      stages: completedStages,
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
  }));

  it('shares one active generation across duplicate callers', fakeAsync(() => {
    const first = api.generateSaga('game-1', () => undefined);
    const second = api.generateSaga('game-1', () => undefined);
    expect(second).toBe(first);
    first.subscribe();
    second.subscribe();

    http.expectOne('/api/games/game-1/generation').flush({
      state: 'queued',
      currentStage: 'analysis',
      error: null,
      stages: emptyStages,
    });
    tick(0);
    http.expectOne('/api/games/game-1/generation').flush({
      state: 'completed',
      currentStage: 'scenes',
      error: null,
      stages: completedStages,
    });
    http.expectOne('/api/games/game-1/scenes').flush({
      status: 'COMPLETED',
      sceneBreakdown: { data: { scenes: [] } },
    });
  }));
});

const emptyStages = {
  analysis: false,
  outline: false,
  story: false,
  validation: false,
  scenes: false,
};

const completedStages = {
  analysis: true,
  outline: true,
  story: true,
  validation: true,
  scenes: true,
};
