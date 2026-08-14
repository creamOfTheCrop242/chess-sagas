import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { CommunitySagaSummary, PublicProfile } from './community.models';
import { CommunityService } from './community.service';

@Component({
  selector: 'app-creator-profile',
  standalone: true,
  imports: [DatePipe, RouterLink],
  template: `
    <main class="profile-page">
      <a class="return-link" routerLink="/records">← Hall of Records</a>
      @if (loading) {
        <p class="state">Opening the chronicler’s ledger…</p>
      } @else if (error) {
        <p class="state error" role="alert">{{ error }}</p>
      } @else {
       @if (profile; as chronicler) {
        <header class="profile-card">
          @if (chronicler.avatarUrl) { <img [src]="chronicler.avatarUrl" alt="" referrerpolicy="no-referrer" /> }
          <div>
            <p class="eyebrow">Public chronicler</p>
            <h1>{{ chronicler.displayName }}</h1>
            <p class="handle">&#64;{{ chronicler.handle }}</p>
            @if (chronicler.bio) { <p class="bio">{{ chronicler.bio }}</p> }
            <p class="joined">Recording since {{ chronicler.createdAt | date: 'longDate' }} · {{ chronicler.sagaCount }} public sagas</p>
          </div>
        </header>
        <section class="saga-shelf">
          <h2>Preserved sagas</h2>
          @if (!sagas.length) { <p class="state">This chronicler has no attributed public sagas.</p> }
          @for (saga of sagas; track saga.id) {
            <article>
              <div><h3>{{ saga.title }}</h3><p>{{ saga.whitePlayer }} vs {{ saga.blackPlayer }}</p></div>
              <a [routerLink]="['/records', saga.id]">Replay →</a>
            </article>
          }
        </section>
       }
      }
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './profile-page.css',
})
export class CreatorProfileComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly community = inject(CommunityService);
  profile: PublicProfile | null = null;
  sagas: CommunitySagaSummary[] = [];
  loading = true;
  error: string | null = null;

  ngOnInit(): void {
    const handle = this.route.snapshot.paramMap.get('handle') ?? '';
    forkJoin({
      profile: this.community.profile(handle),
      sagas: this.community.profileSagas(handle, { limit: 50 }),
    }).subscribe({
      next: ({ profile, sagas }) => {
        this.profile = profile;
        this.sagas = sagas.items;
        this.loading = false;
      },
      error: () => {
        this.error = 'This chronicler could not be found.';
        this.loading = false;
      },
    });
  }
}
