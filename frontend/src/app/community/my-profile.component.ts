import { Component, OnInit, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { EditableProfile } from './community.models';
import { CommunityService } from './community.service';

@Component({
  selector: 'app-my-profile',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="profile-page">
      <a class="return-link" routerLink="/records">← Hall of Records</a>
      <section class="profile-card edit-card">
        <div>
          <p class="eyebrow">Chronicler settings</p>
          <h1>My public profile</h1>
          @if (auth.loading()) { <p class="state">Checking your seal…</p> }
          @else if (!auth.user()) {
            <p class="state">Sign in before creating a chronicler profile.</p>
            <a routerLink="/login">Sign in</a>
          } @else if (loading) { <p class="state">Opening your profile…</p> }
          @else if (profile) {
            <form (ngSubmit)="save()">
              <label>Public handle <input name="handle" [(ngModel)]="profile.handle" maxlength="30" required /></label>
              <label>Display name <input name="displayName" [(ngModel)]="profile.displayName" maxlength="80" required /></label>
              <label>Biography <textarea name="bio" [(ngModel)]="profile.bio" maxlength="500" rows="6"></textarea></label>
              <label class="credit-choice"><input type="checkbox" name="showCreatorCredit" [(ngModel)]="profile.showCreatorCredit" /> Credit my profile on public sagas</label>
              <p class="privacy-note">Turning this off removes your identity from saga cards and your public saga shelf.</p>
              <button type="submit" [disabled]="saving">{{ saving ? 'Saving…' : 'Save profile' }}</button>
              @if (message) { <p class="state" [class.error]="saveFailed" role="status">{{ message }}</p> }
            </form>
            <section class="danger-zone">
              <h2>Delete account</h2>
              <p>This permanently deletes your profile, sign-in sessions, bookmarks, reading progress, and unused credits. Public sagas remain in the Hall of Records without your name.</p>
              <p>If you have a subscription, cancel it from Saga Credits before deleting your account.</p>
              <label>Type <strong>DELETE MY ACCOUNT</strong> to confirm
                <input [(ngModel)]="deletionConfirmation" [ngModelOptions]="{ standalone: true }" autocomplete="off" />
              </label>
              <button class="danger-button" type="button" [disabled]="deleting || deletionConfirmation !== 'DELETE MY ACCOUNT'" (click)="deleteAccount()">
                {{ deleting ? 'Deleting…' : 'Permanently delete account' }}
              </button>
              @if (deletionMessage) { <p class="state error" role="alert">{{ deletionMessage }}</p> }
            </section>
          }
        </div>
      </section>
    </main>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './profile-page.css',
})
export class MyProfileComponent implements OnInit {
  readonly auth = inject(AuthService);
  private readonly community = inject(CommunityService);
  private readonly router = inject(Router);
  profile: EditableProfile | null = null;
  loading = true;
  saving = false;
  message: string | null = null;
  saveFailed = false;
  deletionConfirmation = '';
  deletionMessage: string | null = null;
  deleting = false;

  ngOnInit(): void {
    if (!this.auth.loading() && this.auth.user()) this.load();
    else {
      const wait = window.setInterval(() => {
        if (this.auth.loading()) return;
        window.clearInterval(wait);
        if (this.auth.user()) this.load();
        else this.loading = false;
      }, 50);
    }
  }

  save(): void {
    if (!this.profile || this.saving) return;
    this.saving = true;
    this.message = null;
    this.community.updateProfile({
      handle: this.profile.handle,
      displayName: this.profile.displayName,
      bio: this.profile.bio,
      showCreatorCredit: this.profile.showCreatorCredit,
    }).subscribe({
      next: (profile) => {
        this.profile = profile;
        this.message = 'Your chronicler profile has been saved.';
        this.saveFailed = false;
        this.saving = false;
      },
      error: (error) => {
        this.message = error?.error?.message ?? 'The profile could not be saved.';
        this.saveFailed = true;
        this.saving = false;
      },
    });
  }

  deleteAccount(): void {
    if (this.deleting || this.deletionConfirmation !== 'DELETE MY ACCOUNT') return;
    const accepted = window.confirm(
      'Delete your Chess Sagas account permanently? This cannot be undone.',
    );
    if (!accepted) return;
    this.deleting = true;
    this.deletionMessage = null;
    this.auth.deleteAccount(this.deletionConfirmation).subscribe({
      next: () => {
        this.auth.clearUser();
        void this.router.navigateByUrl('/');
      },
      error: (error) => {
        this.deletionMessage =
          error?.error?.message ?? 'Your account could not be deleted.';
        this.deleting = false;
      },
    });
  }

  private load(): void {
    this.community.myProfile().subscribe({
      next: (profile) => {
        this.profile = profile;
        this.loading = false;
      },
      error: () => {
        this.message = 'Your profile could not be opened.';
        this.saveFailed = true;
        this.loading = false;
      },
    });
  }
}
