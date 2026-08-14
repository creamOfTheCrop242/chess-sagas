import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ChampionEntry,
  ChampionStats,
  EditableProfile,
  ProfileUpdate,
  PublicProfile,
  SagaPage,
} from './community.models';

export interface SagaQuery {
  cursor?: string;
  limit?: number;
  q?: string;
  creator?: string;
}

@Injectable({ providedIn: 'root' })
export class CommunityService {
  private readonly http = inject(HttpClient);

  list(query: SagaQuery = {}): Observable<SagaPage> {
    return this.http.get<SagaPage>('/api/sagas', {
      params: this.params(query),
    });
  }

  champions(
    query: {
      side?: 'north' | 'south';
      type?: string;
      limit?: number;
    } = {},
  ): Observable<ChampionEntry[]> {
    let params = new HttpParams();
    if (query.side) params = params.set('side', query.side);
    if (query.type) params = params.set('type', query.type);
    if (query.limit) params = params.set('limit', query.limit);
    return this.http.get<ChampionEntry[]>('/api/sagas/champions', { params });
  }

  championStats(): Observable<ChampionStats> {
    return this.http.get<ChampionStats>('/api/sagas/champions/stats');
  }

  mine(query: SagaQuery = {}): Observable<SagaPage> {
    return this.http.get<SagaPage>('/api/sagas/mine', {
      params: this.params(query),
      withCredentials: true,
    });
  }

  saved(query: SagaQuery = {}): Observable<SagaPage> {
    return this.http.get<SagaPage>('/api/sagas/saved', {
      params: this.params(query),
      withCredentials: true,
    });
  }

  save(sagaId: string): Observable<{ saved: true }> {
    return this.http.post<{ saved: true }>(
      `/api/sagas/${sagaId}/bookmark`,
      null,
      { withCredentials: true },
    );
  }

  unsave(sagaId: string): Observable<{ saved: false }> {
    return this.http.delete<{ saved: false }>(`/api/sagas/${sagaId}/bookmark`, {
      withCredentials: true,
    });
  }

  profile(handle: string): Observable<PublicProfile> {
    return this.http.get<PublicProfile>(`/api/profiles/${handle}`);
  }

  profileSagas(handle: string, query: SagaQuery = {}): Observable<SagaPage> {
    return this.http.get<SagaPage>(`/api/profiles/${handle}/sagas`, {
      params: this.params(query),
    });
  }

  myProfile(): Observable<EditableProfile> {
    return this.http.get<EditableProfile>('/api/profiles/me', {
      withCredentials: true,
    });
  }

  updateProfile(update: ProfileUpdate): Observable<EditableProfile> {
    return this.http.patch<EditableProfile>('/api/profiles/me', update, {
      withCredentials: true,
    });
  }

  private params(query: SagaQuery): HttpParams {
    let params = new HttpParams();
    if (query.cursor) params = params.set('cursor', query.cursor);
    if (query.limit) params = params.set('limit', query.limit);
    if (query.q) params = params.set('q', query.q);
    if (query.creator) params = params.set('creator', query.creator);
    return params;
  }
}
