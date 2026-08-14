import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PieceLoreComponent } from './piece-lore.component';

describe('PieceLoreComponent', () => {
    let fixture: ComponentFixture<PieceLoreComponent>;

    beforeEach(async () => {
        await TestBed.configureTestingModule({
            imports: [PieceLoreComponent],
            providers: [provideRouter([])],
        }).compileComponents();

        fixture = TestBed.createComponent(PieceLoreComponent);
        fixture.detectChanges();
    });

    it('documents all six battlefield archetypes', () => {
        const cards = fixture.nativeElement.querySelectorAll('.lore-card');
        expect(cards).toHaveLength(6);
        expect(fixture.nativeElement.textContent).toContain('Moving Fortress');
        expect(fixture.nativeElement.textContent).toContain('Archwizard');
        expect(fixture.nativeElement.textContent).toContain('Soldier Company');
    });

    it('explains that teleportation is not the extent of Archwizard magic', () => {
        expect(fixture.nativeElement.textContent).toContain('Teleportation is one movement discipline—not the limit of their magic or a requirement for every step.');
    });

    it('documents the Moving Fortress pilot origin and life support', () => {
        expect(fixture.nativeElement.textContent).toContain('wounded beyond the reach of healing');
        expect(fixture.nativeElement.textContent).toContain('cannot survive outside the machine');
        expect(fixture.nativeElement.textContent).toContain('rotary gatling gun');
        expect(fixture.nativeElement.textContent).toContain('devastating ram');
        expect(fixture.nativeElement.textContent).toContain('Specialized attachments');
    });

    it('documents the Queen training, augmentation, and armor', () => {
        expect(fixture.nativeElement.textContent).toContain('Raised from birth to become the kingdom’s most complete champion');
        expect(fixture.nativeElement.textContent).toContain('Archwizard augmentation transformed her body beyond mortal limits');
        expect(fixture.nativeElement.textContent).toContain('the same nearly indestructible material as a Moving Fortress');
    });

    it('provides a collapsible catalog of every pawn subclass', () => {
        const details = fixture.nativeElement.querySelector('.pawn-subclasses') as HTMLDetailsElement;
        const subclasses = details.querySelectorAll('li');

        expect(details.open).toBe(false);
        expect(subclasses).toHaveLength(13);
        expect(details.textContent).toContain('Mage Acolyte');
        expect(details.textContent).toContain('Queen Candidate');
        expect(details.textContent).toContain('identified in childhood');
        expect(details.textContent).toContain('old enough for battle');
        expect(details.textContent).toContain('Chaplain');
        expect(details.textContent).toContain('Beast Handler');
        expect(details.textContent).toContain('Swordsman');
        expect(details.textContent).not.toContain('Sergeant');

        (details.querySelector('summary') as HTMLElement).click();
        expect(details.open).toBe(true);
    });

    it('provides a collapsible catalog of every Mythic Arm', () => {
        const details = fixture.nativeElement.querySelector('.mythic-arms') as HTMLDetailsElement;
        const arms = details.querySelectorAll('li');

        expect(details.open).toBe(false);
        expect(arms).toHaveLength(7);
        expect(details.textContent).toContain('Stormbound Great Hammer');
        expect(details.textContent).toContain('Seal-Forged Greatsword');
        expect(details.textContent).toContain('Matched Oathbound Swords');
        expect(details.textContent).not.toContain('Maul');
        expect(details.textContent).not.toContain('Flail');

        (details.querySelector('summary') as HTMLElement).click();
        expect(details.open).toBe(true);
    });
});
