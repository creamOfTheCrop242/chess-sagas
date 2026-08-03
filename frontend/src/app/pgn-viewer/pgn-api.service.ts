import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  catchError,
  concatMap,
  Observable,
  of,
  retry,
  switchMap,
  tap,
  timer,
  throwError,
} from 'rxjs';
import {
  ArchivedRecord,
  ArchiveRecordSummary,
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

  getRecords(): Observable<ArchiveRecordSummary[]> {
    return this.http.get<ArchiveRecordSummary[]>(
      'http://localhost:3000/games/records',
    );
  }

  getRecord(gameId: string): Observable<ArchivedRecord> {
    return this.http.get<ArchivedRecord>(
      `http://localhost:3000/games/records/${gameId}`,
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
          const generation =
            stage === 'story'
              ? this.generateStoryWithTargetedRetry<T>(url, () =>
                  onProgress(stage, 'retrying'),
                )
              : this.http.post<T>(url, {}).pipe(this.retryFailedStage<T>());
          return generation.pipe(tap(() => onProgress(stage, 'completed')));
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
      this.retryFailedStage(),
      tap(() => onProgress('validation', 'completed')),
      catchError((error: unknown) => {
        onProgress('validation', 'failed');
        return throwError(() => error);
      }),
    );
  }

  private retryFailedStage<T>() {
    return retry<T>({
      count: 1,
      delay: (error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          (error.status === 0 || error.status >= 500)
        ) {
          return timer(500);
        }
        return throwError(() => error);
      },
    });
  }

  private generateStoryWithTargetedRetry<T>(
    url: string,
    onRetry: () => void,
  ): Observable<T> {
    return this.http.post<T>(url, {}).pipe(
      catchError((error: unknown) => {
        if (
          error instanceof HttpErrorResponse &&
          (error.status === 0 || error.status >= 500)
        ) {
          onRetry();
          return this.http.post<T>(url, {
            validationFeedback: this.generationErrorMessage(error),
          });
        }
        return throwError(() => error);
      }),
    );
  }

  private generationErrorMessage(error: HttpErrorResponse): string {
    const message = error.error?.message;
    if (Array.isArray(message)) return message.join('; ').slice(0, 4_000);
    if (typeof message === 'string') return message.slice(0, 4_000);
    return (error.message || 'Story package failed validation').slice(0, 4_000);
  }
}
