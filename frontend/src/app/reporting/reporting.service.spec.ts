import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ReportingClientService } from './reporting.service';

describe('ReportingClientService', () => {
    let service: ReportingClientService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
        });
        service = TestBed.inject(ReportingClientService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('loads an authenticated overview for the selected window', () => {
        service.overview(90).subscribe();
        const request = http.expectOne('/api/admin/reports/overview?days=90');
        expect(request.request.withCredentials).toBe(true);
        request.flush({});
    });
});
