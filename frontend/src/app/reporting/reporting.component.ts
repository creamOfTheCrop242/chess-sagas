import { CurrencyPipe, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ReportingOverview } from './reporting.models';
import { ReportingClientService } from './reporting.service';

@Component({
  selector: 'app-reporting',
  standalone: true,
  imports: [
    CurrencyPipe,
    DatePipe,
    DecimalPipe,
    PercentPipe,
    FormsModule,
    RouterLink,
  ],
  templateUrl: './reporting.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './reporting.component.css',
})
export class ReportingComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly reporting = inject(ReportingClientService);

  days = 30;
  loading = true;
  report: ReportingOverview | null = null;
  error: 'signin' | 'forbidden' | 'load' | null = null;

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading = true;
    this.error = null;
    this.reporting.overview(this.days).subscribe({
      next: (report) => {
        this.report = report;
        this.loading = false;
      },
      error: (error: { status?: number }) => {
        this.report = null;
        this.error =
          error.status === 401
            ? 'signin'
            : error.status === 403
              ? 'forbidden'
              : 'load';
        this.loading = false;
      },
    });
  }

  usdFromCents(cents: number): number {
    return cents / 100;
  }

  minutes(seconds: number): number {
    return seconds / 60;
  }

  stageLabel(stage: string): string {
    return stage.replaceAll('_', ' ').toLowerCase();
  }

  billingLabel(state: string): string {
    return state.replaceAll('_', ' ').toLowerCase();
  }

  entries(values: Record<string, number>): Array<[string, number]> {
    return Object.entries(values).sort((left, right) => right[1] - left[1]);
  }
}
