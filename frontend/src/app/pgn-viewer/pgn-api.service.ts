import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  catchError,
  concatMap,
  Observable,
  of,
  switchMap,
  tap,
  throwError,
} from 'rxjs';
import {
  NarrateRequest,
  NarrateResponse,
  ParsedPgn,
  SavedGame,
  SagaStage,
  SagaStageState,
  SceneBreakdownResponse,
} from './pgn.models';

@Injectable({ providedIn: 'root' })
export class PgnApiService {
  private readonly parseUrl = 'http://localhost:3000/pgn/parse';
  private readonly narrateUrl = 'http://localhost:3000/story/narrate';

  constructor(private readonly http: HttpClient) {}

  parse(pgn: string): Observable<ParsedPgn> {
    return this.http.post<ParsedPgn>(this.parseUrl, { pgn });
  }

  narrate(payload: NarrateRequest): Observable<NarrateResponse> {
    return this.http.post<NarrateResponse>(this.narrateUrl, payload);
  }

  createGame(pgn: string): Observable<SavedGame> {
    return this.http.post<SavedGame>('http://localhost:3000/games', { pgn });
  }

  generateSaga(
    gameId: string,
    onProgress: (stage: SagaStage, state: SagaStageState) => void,
  ): Observable<SceneBreakdownResponse> {
    const base = `http://localhost:3000/games/${gameId}`;
    return this.ensureStage(`${base}/analysis`, 'analysis', onProgress).pipe(
      concatMap(() =>
        this.ensureStage(`${base}/outline`, 'outline', onProgress),
      ),
      concatMap(() => this.ensureStage(`${base}/story`, 'story', onProgress)),
      concatMap(() => this.ensureValidStory(base, onProgress)),
      concatMap(() =>
        this.ensureStage<SceneBreakdownResponse>(
          `${base}/scenes`,
          'scenes',
          onProgress,
        ),
      ),
    );
  }

  getScenes(gameId: string): Observable<SceneBreakdownResponse> {
    return this.http.get<SceneBreakdownResponse>(
      `http://localhost:3000/games/${gameId}/scenes`,
    );
  }

  private ensureStage<T = unknown>(
    url: string,
    stage: SagaStage,
    onProgress: (stage: SagaStage, state: SagaStageState) => void,
  ): Observable<T> {
    onProgress(stage, 'checking');
    return this.http.get<T>(url).pipe(
      tap(() => onProgress(stage, 'reused')),
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          onProgress(stage, 'generating');
          return this.http
            .post<T>(url, {})
            .pipe(tap(() => onProgress(stage, 'completed')));
        }
        return throwError(() => error);
      }),
      catchError((error: unknown) => {
        onProgress(stage, 'failed');
        return throwError(() => error);
      }),
    );
  }

  private ensureValidStory(
    base: string,
    onProgress: (stage: SagaStage, state: SagaStageState) => void,
  ): Observable<unknown> {
    const url = `${base}/validation`;
    return this.ensureStage<{
      storyValidation?: { valid: boolean };
    }>(url, 'validation', onProgress).pipe(
      switchMap((response) =>
        response.storyValidation?.valid
          ? of(response)
          : this.regenerateValidation(url, onProgress),
      ),
    );
  }

  private regenerateValidation(
    url: string,
    onProgress: (stage: SagaStage, state: SagaStageState) => void,
  ): Observable<unknown> {
    onProgress('validation', 'generating');
    return this.http.post(url, {}).pipe(
      tap(() => onProgress('validation', 'completed')),
      catchError((error: unknown) => {
        onProgress('validation', 'failed');
        return throwError(() => error);
      }),
    );
  }
}
