import { HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  catchError,
  concatMap,
  Observable,
  of,
  switchMap,
  throwError,
} from 'rxjs';
import {
  NarrateRequest,
  NarrateResponse,
  ParsedPgn,
  SavedGame,
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

  generateSaga(gameId: string): Observable<SceneBreakdownResponse> {
    const base = `http://localhost:3000/games/${gameId}`;
    return this.ensureStage(`${base}/analysis`).pipe(
      concatMap(() => this.ensureStage(`${base}/outline`)),
      concatMap(() => this.ensureStage(`${base}/story`)),
      concatMap(() => this.ensureValidStory(base)),
      concatMap(() =>
        this.ensureStage<SceneBreakdownResponse>(`${base}/scenes`),
      ),
    );
  }

  getScenes(gameId: string): Observable<SceneBreakdownResponse> {
    return this.http.get<SceneBreakdownResponse>(
      `http://localhost:3000/games/${gameId}/scenes`,
    );
  }

  private ensureStage<T = unknown>(url: string): Observable<T> {
    return this.http.get<T>(url).pipe(
      catchError((error: unknown) => {
        if (error instanceof HttpErrorResponse && error.status === 404) {
          return this.http.post<T>(url, {});
        }
        return throwError(() => error);
      }),
    );
  }

  private ensureValidStory(base: string): Observable<unknown> {
    const url = `${base}/validation`;
    return this.ensureStage<{
      storyValidation?: { valid: boolean };
    }>(url).pipe(
      switchMap((response) =>
        response.storyValidation?.valid
          ? of(response)
          : this.http.post(url, {}),
      ),
    );
  }
}
