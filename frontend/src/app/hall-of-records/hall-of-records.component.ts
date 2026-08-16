import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { BillingClientService } from '../billing/billing.service';
import { CommunitySagaSummary } from '../community/community.models';
import { CommunityService } from '../community/community.service';

type RecordView = 'public' | 'mine' | 'saved';

@Component({
  selector: 'app-hall-of-records',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink],
  templateUrl: './hall-of-records.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './hall-of-records.component.css',
})
export class HallOfRecordsComponent implements OnInit {
  private readonly community = inject(CommunityService);
  readonly auth = inject(AuthService);
  readonly billing = inject(BillingClientService);

  records: CommunitySagaSummary[] = [];
  view: RecordView = 'public';
  query = '';
  nextCursor: string | null = null;
  totalRecords = 0;
  loading = true;
  loadingMore = false;
  error: string | null = null;
  readonly savedIds = new Set<string>();
  deletingSagaId: string | null = null;

  ngOnInit(): void {
    if (this.auth.user()) this.billing.refresh();
    this.load();
  }

  selectView(view: RecordView): void {
    if (view !== 'public' && !this.auth.user()) return;
    this.view = view;
    this.load();
  }

  search(): void {
    this.load();
  }

  loadMore(): void {
    if (!this.nextCursor || this.loadingMore) return;
    this.fetch(this.nextCursor, true);
  }

  toggleSaved(record: CommunitySagaSummary): void {
    if (!this.auth.user()) return;
    const saved = this.savedIds.has(record.id) || this.view === 'saved';
    const request: Observable<unknown> = saved
      ? this.community.unsave(record.id)
      : this.community.save(record.id);
    request.subscribe({
      next: () => {
        if (saved) {
          this.savedIds.delete(record.id);
          if (this.view === 'saved') {
            this.records = this.records.filter((item) => item.id !== record.id);
          }
        } else {
          this.savedIds.add(record.id);
        }
      },
      error: () => (this.error = 'The archive mark could not be changed.'),
    });
  }

  isSaved(record: CommunitySagaSummary): boolean {
    return this.view === 'saved' || this.savedIds.has(record.id);
  }

  deleteArtifacts(record: CommunitySagaSummary): void {
    if (!this.billing.status()?.unlimited || this.deletingSagaId) return;
    const confirmed = window.confirm(
      `Delete every generated story and artifact for “${record.title}”? The original PGN and game ledger will be kept for a clean regeneration.`,
    );
    if (!confirmed) return;

    this.deletingSagaId = record.id;
    this.error = null;
    this.community.deleteArtifacts(record.id).subscribe({
      next: ({ gameId }) => {
        const deletedCount = this.records.filter(
          (item) => item.gameId === gameId,
        ).length;
        this.records = this.records.filter((item) => item.gameId !== gameId);
        this.totalRecords = Math.max(0, this.totalRecords - deletedCount);
        this.deletingSagaId = null;
      },
      error: (error: { error?: { message?: string } }) => {
        this.error =
          error.error?.message ?? 'The saga artifacts could not be deleted.';
        this.deletingSagaId = null;
      },
    });
  }

  private load(): void {
    this.records = [];
    this.nextCursor = null;
    this.totalRecords = 0;
    this.error = null;
    this.loading = true;
    this.fetch(undefined, false);
  }

  private fetch(cursor: string | undefined, append: boolean): void {
    if (append) this.loadingMore = true;
    const options = { limit: 20, cursor, q: this.query.trim() || undefined };
    const request =
      this.view === 'mine'
        ? this.community.mine(options)
        : this.view === 'saved'
          ? this.community.saved(options)
          : this.community.list(options);
    request.subscribe({
      next: (page) => {
        this.records = append ? [...this.records, ...page.items] : page.items;
        this.nextCursor = page.nextCursor;
        this.totalRecords = page.total;
        if (this.view === 'saved') {
          page.items.forEach((record) => this.savedIds.add(record.id));
        }
        this.loading = false;
        this.loadingMore = false;
      },
      error: () => {
        this.error = 'The records could not be opened.';
        this.loading = false;
        this.loadingMore = false;
      },
    });
  }
}
