import { provideHttpClient, withXhr } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NgForm } from '@angular/forms';
import { AuthService } from '../auth/auth.service';
import { ContactComponent } from './contact.component';

describe('ContactComponent', () => {
    let fixture: ComponentFixture<ContactComponent>;
    let component: ContactComponent;
    let http: HttpTestingController;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [ContactComponent],
            providers: [
                provideRouter([]),
                provideHttpClient(withXhr()),
                provideHttpClientTesting(),
                {
                    provide: AuthService,
                    useValue: {
                        user: signal({
                            id: 'user-1',
                            email: 'reader@example.com',
                            displayName: 'Reader One',
                            avatarUrl: null,
                        }),
                    },
                },
            ],
        }).compileComponents();

        fixture = TestBed.createComponent(ContactComponent);
        component = fixture.componentInstance;
        http = TestBed.inject(HttpTestingController);
        fixture.detectChanges();
    });

    afterEach(() => http.verify());

    it('prefills the authenticated user and delivers support messages', () => {
        const form = fixture.debugElement
            .query(By.directive(NgForm))
            .injector.get(NgForm);
        form.setValue({
            category: 'suggestion',
            name: 'Reader One',
            email: 'reader@example.com',
            subject: 'More battlefield locations',
            message: 'Please add a ruined coastal fortress environment.',
            website: '',
        });
        fixture.detectChanges();

        component.submit(form);
        const request = http.expectOne('/api/support/messages');
        expect(request.request.method).toBe('POST');
        expect(request.request.body).toEqual(expect.objectContaining({
            name: 'Reader One',
            email: 'reader@example.com',
            category: 'suggestion',
        }));
        request.flush({ accepted: true });
        fixture.detectChanges();

        expect(component.sent()).toBe(true);
        expect(fixture.nativeElement.textContent).toContain('Your message has reached the archive');
    });
});
