import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CalamityLoreComponent } from './calamity-lore.component';

describe('CalamityLoreComponent', () => {
    let fixture: ComponentFixture<CalamityLoreComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [CalamityLoreComponent],
            providers: [provideRouter([])],
        }).compileComponents();

        fixture = TestBed.createComponent(CalamityLoreComponent);
        fixture.detectChanges();
    });

    it('presents the established history in six chapters', () => {
        expect(fixture.nativeElement.querySelectorAll('.history-chapter')).toHaveLength(6);
        expect(fixture.nativeElement.textContent).toContain('both kingdoms immediately lost access to the magic');
        expect(fixture.nativeElement.textContent).toContain('formed a connection to the home universe');
        expect(fixture.nativeElement.textContent).toContain('each forged a Royal Seal to receive and distribute that distant magic');
        expect(fixture.nativeElement.textContent).toContain('Every battle record reveals the final battle of one of those separate realities.');
        expect(fixture.nativeElement.textContent).toContain('The Calamity did not create the separate realities.');
        expect(fixture.nativeElement.textContent).toContain('Those incompatible currents of power crossed within the same plane.');
        expect(fixture.nativeElement.textContent).toContain('No surviving calendar can say how long ago the Calamity occurred.');
        expect(fixture.nativeElement.textContent).toContain('The Royal Seals');
    });

    it('links the history to the chronicle and piece codex', () => {
        const links = Array.from(fixture.nativeElement.querySelectorAll('a')) as HTMLAnchorElement[];
        expect(links.some((link) => link.getAttribute('href') === '/')).toBe(true);
        expect(links.some((link) => link.getAttribute('href') === '/lore')).toBe(true);
    });
});
