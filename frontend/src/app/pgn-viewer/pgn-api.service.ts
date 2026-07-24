import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { concatMap, Observable } from 'rxjs';
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
    return this.http.post(`${base}/analysis`, {}).pipe(
      concatMap(() => this.http.post(`${base}/outline`, {})),
      concatMap(() => this.http.post(`${base}/story`, {})),
      concatMap(() => this.http.post(`${base}/validation`, {})),
      concatMap(() =>
        this.http.post<SceneBreakdownResponse>(`${base}/scenes`, {}),
      ),
    );
  }

  getScenes(gameId: string): Observable<SceneBreakdownResponse> {
    return this.http.get<SceneBreakdownResponse>(
      `http://localhost:3000/games/${gameId}/scenes`,
    );
  }
}
