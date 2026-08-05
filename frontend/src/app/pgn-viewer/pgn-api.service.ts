import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  catchError,
  concatMap,
  finalize,
  Observable,
  of,
  retry,
  shareReplay,
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
  PipelineStatus,
  SavedGame,
  SavedGameRecord,
  SagaStage,
  SagaStageState,
  SceneBreakdownResponse,
} from './pgn.models';

@Injectable({ providedIn: 'root' })
export class PgnApiService {
  private readonly recentGenerationKey = 'chess-sagas:active-game-id';
  private readonly apiBase = '/api';
  private readonly parseUrl = `${this.apiBase}/pgn/parse`;
  private readonly narrateUrl = `${this.apiBase}/story/narrate`;
  private readonly activeGenerations = new Map<
    string,
    Observable<SceneBreakdownResponse>
  >();
  private readonly generationListeners = new Map<
    string,
    Set<(stage: SagaStage, state: SagaStageState) => void>
  >();
  private readonly generationState = new Map<
    string,
    Partial<Record<SagaStage, SagaStageState>>
  >();

  constructor(private readonly http: HttpClient) {}

  parse(pgn: string): Observable<ParsedPgn> {
    return this.http.post<ParsedPgn>(this.parseUrl, { pgn });
  }

  narrate(payload: NarrateRequest): Observable<NarrateResponse> {
    return this.http.post<NarrateResponse>(this.narrateUrl, payload);
  }

  createGame(pgn: string): Observable<SavedGame> {
    return this.http.post<SavedGame>(`${this.apiBase}/games`, { pgn });
  }

  getGame(gameId: string): Observable<SavedGameRecord> {
    return this.http.get<SavedGameRecord>(`${this.apiBase}/games/${gameId}`);
  }

  recentGenerationGameId(): string | null {
    try {
      return sessionStorage.getItem(this.recentGenerationKey);
    } catch {
      return null;
    }
  }

  generateSaga(
    gameId: string,
    onProgress: (stage: SagaStage, state: SagaStageState) => void,
  ): Observable<SceneBreakdownResponse> {
    try {
      sessionStorage.setItem(this.recentGenerationKey, gameId);
    } catch {
      // Session restoration is optional; generation still proceeds.
    }
    this.addGenerationListener(gameId, onProgress);
    const active = this.activeGenerations.get(gameId);
    if (active) return active;

    const base = `${this.apiBase}/games/${gameId}`;
    this.notifyAllStages(gameId, 'checking');
    let storyResponse: SceneBreakdownResponse | null = null;
    const generation = this.http
      .get<PipelineStatus>(`${base}/pipeline-status`)
      .pipe(
        concatMap((status) =>
          this.runStage(base, gameId, 'analysis', status.analysis, status),
        ),
        concatMap(({ status }) =>
          this.runStage(base, gameId, 'outline', status.outline, status),
        ),
        concatMap(({ status }) =>
          this.runStage<SceneBreakdownResponse>(
            base,
            gameId,
            'story',
            status.story,
            status,
          ),
        ),
        concatMap(({ status, response }) => {
          storyResponse = response;
          if (storyResponse?.sceneBreakdown) {
            this.notify(gameId, 'validation', 'completed');
            this.notify(gameId, 'scenes', 'completed');
            return of(storyResponse);
          }
          return this.runStage(
            base,
            gameId,
            'validation',
            status.validation,
            status,
          ).pipe(
            concatMap(() =>
              status.scenes
                ? this.loadReusedScenes(base, gameId)
                : this.runStage<SceneBreakdownResponse>(
                    base,
                    gameId,
                    'scenes',
                    false,
                    status,
                  ).pipe(switchMap(({ response }) => of(response!))),
            ),
          );
        }),
        tap(() => this.clearRecentGeneration(gameId)),
        finalize(() => {
          this.activeGenerations.delete(gameId);
          this.generationListeners.delete(gameId);
          this.generationState.delete(gameId);
        }),
        shareReplay({ bufferSize: 1, refCount: false }),
      );
    this.activeGenerations.set(gameId, generation);
    return generation;
  }

  getScenes(gameId: string): Observable<SceneBreakdownResponse> {
    return this.http.get<SceneBreakdownResponse>(
      `${this.apiBase}/games/${gameId}/scenes`,
    );
  }

  getRecords(): Observable<ArchiveRecordSummary[]> {
    return this.http.get<ArchiveRecordSummary[]>(`${this.apiBase}/games/records`);
  }

  getRecord(gameId: string): Observable<ArchivedRecord> {
    return this.http.get<ArchivedRecord>(
      `${this.apiBase}/games/records/${gameId}`,
    );
  }

  private runStage<T = unknown>(
    base: string,
    gameId: string,
    stage: SagaStage,
    reused: boolean,
    status?: PipelineStatus,
  ): Observable<{ status: PipelineStatus; response: T | null }> {
    const pipelineStatus = status ?? ({} as PipelineStatus);
    if (reused) {
      this.notify(gameId, stage, 'reused');
      return of({ status: pipelineStatus, response: null });
    }
    this.notify(gameId, stage, 'generating');
    return this.http.post<T>(`${base}/${this.stagePath(stage)}`, {}).pipe(
      this.retryFailedStage<T>(),
      tap(() => this.notify(gameId, stage, 'completed')),
      switchMap((response) => of({ status: pipelineStatus, response })),
      catchError((error: unknown) => {
        this.notify(gameId, stage, 'failed');
        return throwError(() => error);
      }),
    );
  }

  private loadReusedScenes(
    base: string,
    gameId: string,
  ): Observable<SceneBreakdownResponse> {
    this.notify(gameId, 'scenes', 'reused');
    return this.http.get<SceneBreakdownResponse>(`${base}/scenes`);
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

  private stagePath(stage: SagaStage): string {
    return stage === 'analysis' ? 'analysis' : stage;
  }

  private addGenerationListener(
    gameId: string,
    listener: (stage: SagaStage, state: SagaStageState) => void,
  ): void {
    const listeners = this.generationListeners.get(gameId) ?? new Set();
    listeners.add(listener);
    this.generationListeners.set(gameId, listeners);
    const state = this.generationState.get(gameId);
    if (!state) return;
    Object.entries(state).forEach(([stage, value]) =>
      listener(stage as SagaStage, value),
    );
  }

  private notify(
    gameId: string,
    stage: SagaStage,
    state: SagaStageState,
  ): void {
    const snapshot = this.generationState.get(gameId) ?? {};
    snapshot[stage] = state;
    this.generationState.set(gameId, snapshot);
    this.generationListeners
      .get(gameId)
      ?.forEach((listener) => listener(stage, state));
  }

  private notifyAllStages(gameId: string, state: SagaStageState): void {
    (['analysis', 'outline', 'story', 'validation', 'scenes'] as const).forEach(
      (stage) => this.notify(gameId, stage, state),
    );
  }

  private clearRecentGeneration(gameId: string): void {
    try {
      if (sessionStorage.getItem(this.recentGenerationKey) === gameId) {
        sessionStorage.removeItem(this.recentGenerationKey);
      }
    } catch {
      // Session restoration is optional.
    }
  }
}
