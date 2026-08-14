import {
  Component,
  inject,
  ChangeDetectionStrategy,
  signal,
} from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './login.component.css',
})
export class LoginComponent {
  readonly auth = inject(AuthService);
  readonly legalAccepted = signal(false);
  readonly authenticationFailed =
    inject(ActivatedRoute).snapshot.queryParamMap.get('error') ===
    'authentication_failed';

  setLegalAccepted(event: Event): void {
    this.legalAccepted.set((event.target as HTMLInputElement).checked);
  }
}
