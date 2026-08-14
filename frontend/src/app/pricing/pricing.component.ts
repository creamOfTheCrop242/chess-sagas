import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import {
  BillingClientService,
  BillingProduct,
} from '../billing/billing.service';

type Offer = {
  product: BillingProduct;
  name: string;
  price: string;
  cadence: string;
  credits: string;
  description: string;
  featured?: boolean;
};

@Component({
  selector: 'app-pricing',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './pricing.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './pricing.component.css',
})
export class PricingComponent {
  readonly auth = inject(AuthService);
  readonly billing = inject(BillingClientService);

  readonly oneTimeOffers: Offer[] = [
    {
      product: 'single_saga',
      name: 'Single Saga',
      price: '$2.50',
      cadence: 'one time',
      credits: '1 saga credit',
      description: 'Chronicle one battle whenever inspiration strikes.',
    },
    {
      product: 'five_sagas',
      name: 'Five Saga Pack',
      price: '$10.99',
      cadence: 'one time',
      credits: '5 saga credits',
      description: 'Save on a small campaign. Purchased credits do not expire.',
      featured: true,
    },
  ];

  readonly plans: Offer[] = [
    {
      product: 'scribe',
      name: 'Scribe',
      price: '$9.99',
      cadence: 'per month',
      credits: '4 credits monthly',
      description: 'For preserving a handful of memorable games each month.',
    },
    {
      product: 'chronicler',
      name: 'Chronicler',
      price: '$17.99',
      cadence: 'per month',
      credits: '9 credits monthly',
      description: 'For regular players building an expanding collection.',
      featured: true,
    },
    {
      product: 'realm_founder',
      name: 'Realm Founder',
      price: '$34.99',
      cadence: 'per month',
      credits: '20 credits monthly',
      description: 'For chronicling campaigns, rivalries, and entire seasons.',
    },
  ];

  constructor() {
    if (this.auth.user()) this.billing.refresh();
  }

  choose(product: BillingProduct): void {
    this.billing.checkout(product);
  }
}
