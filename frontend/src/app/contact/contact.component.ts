import { HttpClient } from '@angular/common/http';
import { Component, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule, type NgForm } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

type SupportCategory = 'bug' | 'suggestion' | 'billing' | 'account' | 'other';

@Component({
  selector: 'app-contact',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './contact.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './contact.component.css',
})
export class ContactComponent {
  readonly sending = signal(false);
  readonly sent = signal(false);
  readonly error = signal<string | null>(null);
  readonly auth = inject(AuthService);

  category: SupportCategory = 'bug';
  name = '';
  email = '';
  subject = '';
  message = '';
  website = '';

  private readonly http = inject(HttpClient);

  constructor() {
    effect(() => {
      const user = this.auth.user();
      if (!user) return;
      if (!this.name) this.name = user.displayName;
      if (!this.email) this.email = user.email;
    });
  }

  submit(form: NgForm): void {
    if (form.invalid || this.sending()) {
      form.control.markAllAsTouched();
      return;
    }
    this.sending.set(true);
    this.sent.set(false);
    this.error.set(null);
    this.http
      .post<{ accepted: true }>('/api/support/messages', {
        category: this.category,
        name: this.name,
        email: this.email,
        subject: this.subject,
        message: this.message,
        website: this.website,
      })
      .subscribe({
        next: () => {
          this.sending.set(false);
          this.sent.set(true);
          this.subject = '';
          this.message = '';
          form.form.markAsPristine();
        },
        error: (response) => {
          this.sending.set(false);
          this.error.set(
            response.status === 429
              ? 'Too many messages were sent from this connection. Please try again later.'
              : 'The message could not be delivered. Please try again or email don@creamofthecrop.tech.',
          );
        },
      });
  }
}
