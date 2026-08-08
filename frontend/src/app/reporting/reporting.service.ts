import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ReportingOverview } from './reporting.models';

@Injectable({ providedIn: 'root' })
export class ReportingClientService {
  private readonly http = inject(HttpClient);

  overview(days: number): Observable<ReportingOverview> {
    return this.http.get<ReportingOverview>('/api/admin/reports/overview', {
      withCredentials: true,
      params: new HttpParams().set('days', days),
    });
  }
}
