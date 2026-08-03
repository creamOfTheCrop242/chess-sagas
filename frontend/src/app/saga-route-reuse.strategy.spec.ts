import type {
  ActivatedRouteSnapshot,
  DetachedRouteHandle,
} from '@angular/router';
import { SagaRouteReuseStrategy } from './saga-route-reuse.strategy';

describe('SagaRouteReuseStrategy', () => {
  const route = (path: string) =>
    ({ routeConfig: { path } }) as ActivatedRouteSnapshot;

  it('preserves only the active Chronicle workspace', () => {
    const strategy = new SagaRouteReuseStrategy();
    const chronicle = route('');
    const lore = route('lore');
    const replay = route('records/:id');
    const handle = { componentRef: {} } as unknown as DetachedRouteHandle;

    expect(strategy.shouldDetach(chronicle)).toBeTrue();
    expect(strategy.shouldDetach(lore)).toBeFalse();
    expect(strategy.shouldDetach(replay)).toBeFalse();

    strategy.store(chronicle, handle);

    expect(strategy.shouldAttach(chronicle)).toBeTrue();
    expect(strategy.retrieve(chronicle)).toBe(handle);
    expect(strategy.shouldAttach(lore)).toBeFalse();
    expect(strategy.retrieve(replay)).toBeNull();
  });
});
