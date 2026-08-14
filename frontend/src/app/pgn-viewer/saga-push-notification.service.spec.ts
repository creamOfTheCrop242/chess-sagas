import { HttpClient } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { of } from 'rxjs';
import { SagaPushNotificationService } from './saga-push-notification.service';

describe('SagaPushNotificationService', () => {
    it('silently skips subscriptions when service workers are unavailable', () => {
        const http = { get: vi.fn().mockName('get') } as unknown as HttpClient;
        const swPush = { isEnabled: false } as SwPush;
        const service = new SagaPushNotificationService(http, swPush);
        let result: PushSubscription | null | undefined;

        service.subscriptionForSaga().subscribe((value) => (result = value));

        expect(result).toBeNull();
        expect(http.get).not.toHaveBeenCalled();
    });

    it('reuses an existing browser push subscription', () => {
        vi.stubGlobal('Notification', { permission: 'granted' });
        const subscription = { endpoint: 'https://push.example/subscription' };
        const http = { get: vi.fn().mockName('get') } as unknown as HttpClient;
        const swPush = {
            isEnabled: true,
            subscription: of(subscription),
        } as unknown as SwPush;
        const service = new SagaPushNotificationService(http, swPush);
        let result: PushSubscription | null | undefined;

        service.subscriptionForSaga().subscribe((value) => (result = value));

        expect(result).toBe(subscription as unknown as PushSubscription);
        expect(http.get).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });
});
