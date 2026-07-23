import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { NarrateRequest, NarrateResponse, ParsedPgn } from './pgn.models';

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
}
