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

  it('passes a story validation failure into one targeted retry', () => {
    const states: string[] = [];
    api
      .generateSaga('game-1', (stage, state) =>
        states.push(`${stage}:${state}`),
      )
      .subscribe();

    http.expectOne('http://localhost:3000/games/game-1/analysis').flush({});
    http.expectOne('http://localhost:3000/games/game-1/outline').flush({});
    http
      .expectOne('http://localhost:3000/games/game-1/story')
      .flush('missing', { status: 404, statusText: 'Not Found' });

    const firstAttempt = http.expectOne(
      'http://localhost:3000/games/game-1/story',
    );
    expect(firstAttempt.request.method).toBe('POST');
    expect(firstAttempt.request.body).toEqual({});
    firstAttempt.flush(
      {
        message:
          "Generated story package contains wound timeline errors: Aric's wound appears prematurely at ply 44",
      },
      { status: 500, statusText: 'Server Error' },
    );

    const targetedRetry = http.expectOne(
      'http://localhost:3000/games/game-1/story',
    );
    expect(targetedRetry.request.method).toBe('POST');
    expect(targetedRetry.request.body.validationFeedback).toContain(
      "Aric's wound appears prematurely at ply 44",
    );
    targetedRetry.flush({});

    http
      .expectOne('http://localhost:3000/games/game-1/validation')
      .flush({ storyValidation: { valid: true } });
    http.expectOne('http://localhost:3000/games/game-1/scenes').flush({
      status: 'COMPLETED',
      sceneBreakdown: { data: { scenes: [] } },
    });

    expect(states).toContain('story:completed');
    expect(states).toContain('story:retrying');
    expect(states.filter((entry) => entry === 'story:generating')).toHaveSize(
      1,
    );
  });
});
