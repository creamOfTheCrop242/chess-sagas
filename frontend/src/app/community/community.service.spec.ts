import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CommunityService } from './community.service';

describe('CommunityService', () => {
    let service: CommunityService;
    let http: HttpTestingController;

    beforeEach(() => {
        TestBed.configureTestingModule({
            providers: [provideHttpClient(withXhr()), provideHttpClientTesting()],
        });
        service = TestBed.inject(CommunityService);
        http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('passes search and pagination to the public saga endpoint', () => {
        service.list({ q: 'glasswind', limit: 20, cursor: 'saga-1' }).subscribe();

        const request = http.expectOne('/api/sagas?cursor=saga-1&limit=20&q=glasswind');
        expect(request.request.method).toBe('GET');
        request.flush({ items: [], nextCursor: null });
    });

    it('passes kingdom and rank filters to the champion endpoint', () => {
        service
            .champions({ side: 'north', type: 'archwizard', limit: 25 })
            .subscribe();

        const request = http.expectOne('/api/sagas/champions?side=north&type=archwizard&limit=25');
        expect(request.request.method).toBe('GET');
        request.flush([]);
    });

    it('loads aggregate champion statistics', () => {
        service.championStats().subscribe();

        const request = http.expectOne('/api/sagas/champions/stats');
        expect(request.request.method).toBe('GET');
        request.flush({ totalBattles: 0 });
    });

    it('uses authenticated requests for saved sagas and bookmarks', () => {
        service.saved().subscribe();
        const saved = http.expectOne('/api/sagas/saved');
        expect(saved.request.withCredentials).toBe(true);
        saved.flush({ items: [], nextCursor: null });

        service.save('saga-1').subscribe();
        const bookmark = http.expectOne('/api/sagas/saga-1/bookmark');
        expect(bookmark.request.method).toBe('POST');
        expect(bookmark.request.withCredentials).toBe(true);
        bookmark.flush({ saved: true });
    });

    it('updates only the signed-in chronicler profile', () => {
        service.updateProfile({ displayName: 'New Name' }).subscribe();

        const request = http.expectOne('/api/profiles/me');
        expect(request.request.method).toBe('PATCH');
        expect(request.request.withCredentials).toBe(true);
        expect(request.request.body).toEqual({ displayName: 'New Name' });
        request.flush({});
    });
});
