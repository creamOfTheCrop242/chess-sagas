import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { BillingClientService } from '../billing/billing.service';
import { PricingComponent } from './pricing.component';

describe('PricingComponent', () => {
  let fixture: ComponentFixture<PricingComponent>;
  const user = signal({
    id: 'user-1',
    email: 'reader@example.com',
    displayName: 'Reader',
    avatarUrl: null,
  });
  const status = signal({
    configured: true,
    enforcementEnabled: false,
    unlimited: false,
    balance: 5,
    reserved: 0,
    available: 5,
    subscription: null,
  });

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PricingComponent],
      providers: [
        provideRouter([]),
        {
          provide: AuthService,
          useValue: { user, loading: signal(false) },
        },
        {
          provide: BillingClientService,
          useValue: {
            status,
            loading: signal(false),
            error: signal(null),
            refresh: jasmine.createSpy('refresh'),
            checkout: jasmine.createSpy('checkout'),
            openPortal: jasmine.createSpy('openPortal'),
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PricingComponent);
    fixture.detectChanges();
  });

  it('shows current credits and all five offers', () => {
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('5 credits available');
    expect(text).toContain('Single Saga');
    expect(text).toContain('Five Saga Pack');
    expect(text).toContain('Scribe');
    expect(text).toContain('Chronicler');
    expect(text).toContain('Realm Founder');
  });
});
