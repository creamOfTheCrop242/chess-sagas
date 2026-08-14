import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { BillingClientService } from './billing.service';

describe('BillingClientService', () => {
    let service: BillingClientService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
        });
        service = TestBed.inject(BillingClientService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('loads the authenticated credit state', () => {
        service.refresh();

        const request = http.expectOne('/api/billing/status');
        expect(request.request.withCredentials).toBe(true);
        request.flush({
            configured: true,
            enforcementEnabled: false,
            unlimited: false,
            balance: 5,
            reserved: 1,
            available: 4,
            subscription: null,
        });

        expect(service.status()?.available).toBe(4);
        expect(service.loading()).toBe(false);
    });

    it('clears private billing state after sign out', () => {
        service.refresh();
        http.expectOne('/api/billing/status').flush({
            configured: true,
            enforcementEnabled: false,
            unlimited: true,
            balance: 0,
            reserved: 0,
            available: null,
            subscription: null,
        });

        service.clear();

        expect(service.status()).toBeNull();
        expect(service.error()).toBeNull();
    });
});
