import type { ActivatedRouteSnapshot, DetachedRouteHandle, } from '@angular/router';
import { SagaRouteReuseStrategy } from './saga-route-reuse.strategy';

describe('SagaRouteReuseStrategy', () => {
    const route = (path: string) => ({ routeConfig: { path } }) as ActivatedRouteSnapshot;

    it('preserves only the active Chronicle workspace', () => {
        const strategy = new SagaRouteReuseStrategy();
        const chronicle = route('');
        const lore = route('lore');
        const replay = route('records/:id');
        const handle = { componentRef: {} } as unknown as DetachedRouteHandle;

        expect(strategy.shouldDetach(chronicle)).toBe(true);
        expect(strategy.shouldDetach(lore)).toBe(false);
        expect(strategy.shouldDetach(replay)).toBe(false);

        strategy.store(chronicle, handle);

        expect(strategy.shouldAttach(chronicle)).toBe(true);
        expect(strategy.retrieve(chronicle)).toBe(handle);
        expect(strategy.shouldAttach(lore)).toBe(false);
        expect(strategy.retrieve(replay)).toBeNull();
    });
});
