import { Injectable } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  BaseRouteReuseStrategy,
  DetachedRouteHandle,
} from '@angular/router';

@Injectable()
export class SagaRouteReuseStrategy extends BaseRouteReuseStrategy {
  private chronicle: DetachedRouteHandle | null = null;

  override shouldDetach(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.path === '';
  }

  override store(
    route: ActivatedRouteSnapshot,
    handle: DetachedRouteHandle | null,
  ): void {
    if (route.routeConfig?.path === '') {
      this.chronicle = handle;
    }
  }

  override shouldAttach(route: ActivatedRouteSnapshot): boolean {
    return route.routeConfig?.path === '' && this.chronicle !== null;
  }

  override retrieve(route: ActivatedRouteSnapshot): DetachedRouteHandle | null {
    return route.routeConfig?.path === '' ? this.chronicle : null;
  }
}
