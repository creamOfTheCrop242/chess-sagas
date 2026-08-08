import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  filter,
  finalize,
  map,
  Observable,
  shareReplay,
  switchMap,
  tap,
  take,
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
  SavedGameRecord,
  SagaGenerationStatus,
  SagaStage,
  SagaStageState,
  SceneBreakdownResponse,
} from './pgn.models';
import { SagaPushNotificationService } from './saga-push-notification.service';

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
  private readonly activeJobObserved = new Set<string>();

  constructor(
    private readonly http: HttpClient,
    private readonly pushNotifications: SagaPushNotificationService,
  ) {}

  parse(pgn: string): Observable<ParsedPgn> {
    return this.http.post<ParsedPgn>(this.parseUrl, { pgn });
  }

  narrate(payload: NarrateRequest): Observable<NarrateResponse> {
    return this.http.post<NarrateResponse>(this.narrateUrl, payload);
  }

  createGame(pgn: string): Observable<SavedGame> {
    return this.http.post<SavedGame>(`${this.apiBase}/games`, { pgn });
  }

  getGenerationStatus(gameId: string): Observable<SagaGenerationStatus> {
    return this.http.get<SagaGenerationStatus>(
      `${this.apiBase}/games/${gameId}/generation`,
    );
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

  forgetRecentGeneration(): void {
    try {
      sessionStorage.removeItem(this.recentGenerationKey);
    } catch {
      // Session restoration is optional.
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
    const generation = this.pushNotifications.subscriptionForSaga().pipe(
      switchMap((pushSubscription) =>
        this.http.post<SagaGenerationStatus>(`${base}/generation`, {
          pushSubscription,
        }),
      ),
      tap((status) => this.syncGenerationStatus(gameId, status)),
      switchMap(() =>
        timer(0, 2_000).pipe(
          switchMap(() =>
            this.http.get<SagaGenerationStatus>(`${base}/generation`),
          ),
          tap((status) => this.syncGenerationStatus(gameId, status)),
          filter(
            (status) =>
              status.state === 'completed' || status.state === 'failed',
          ),
          take(1),
        ),
      ),
      switchMap((status) =>
        status.state === 'failed'
          ? throwError(
              () => new Error(status.error || 'Saga generation failed'),
            )
          : this.getScenes(gameId),
      ),
      tap(() => this.clearRecentGeneration(gameId)),
      finalize(() => {
        this.activeGenerations.delete(gameId);
        this.generationListeners.delete(gameId);
        this.generationState.delete(gameId);
        this.activeJobObserved.delete(gameId);
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
    return this.http.get<ArchiveRecordSummary[]>(
      `${this.apiBase}/games/records`,
    );
  }

  getRecord(gameId: string): Observable<ArchivedRecord> {
    return this.http
      .get<{
        id: string;
        gameId: string;
        rawPgn: string;
        whitePlayer: string;
        blackPlayer: string;
        result: string;
        createdAt: string;
        completedAt: string;
        ledger: ArchivedRecord['ledger']['data'];
        sceneBreakdown: ArchivedRecord['sceneBreakdown']['data'];
      }>(`${this.apiBase}/sagas/${gameId}`, { withCredentials: true })
      .pipe(
        map((record) => ({
          id: record.gameId,
          rawPgn: record.rawPgn,
          whitePlayer: record.whitePlayer,
          blackPlayer: record.blackPlayer,
          result: record.result,
          createdAt: record.createdAt,
          completedAt: record.completedAt,
          ledger: { data: record.ledger },
          sceneBreakdown: { data: record.sceneBreakdown },
        })),
      );
  }

  private syncGenerationStatus(
    gameId: string,
    status: SagaGenerationStatus,
  ): void {
    if (status.state === 'queued' || status.state === 'running') {
      this.activeJobObserved.add(gameId);
    }
    const completedDuringThisRequest = this.activeJobObserved.has(gameId);
    const stages: SagaStage[] = [
      'analysis',
      'outline',
      'story',
      'validation',
      'scenes',
    ];
    const currentIndex = stages.indexOf(status.currentStage);
    const previous = this.generationState.get(gameId) ?? {};
    stages.forEach((stage, index) => {
      if (status.stages[stage]) {
        this.notify(
          gameId,
          stage,
          previous[stage] === 'generating' || completedDuringThisRequest
            ? 'completed'
            : 'reused',
        );
      } else if (status.state === 'failed' && stage === status.currentStage) {
        this.notify(gameId, stage, 'failed');
      } else if (status.state === 'running' && index === currentIndex) {
        this.notify(gameId, stage, 'generating');
      } else {
        this.notify(gameId, stage, 'pending');
      }
    });
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
