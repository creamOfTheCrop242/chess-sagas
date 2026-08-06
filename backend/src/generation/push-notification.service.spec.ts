import { ConfigService } from '@nestjs/config';
import { PushNotificationService } from './push-notification.service';

describe('PushNotificationService', () => {
  it('deduplicates subscriptions by endpoint', () => {
    const service = new PushNotificationService({
      get: jest.fn(),
    } as unknown as ConfigService);
    const existing = [subscription('https://push.example/one', 'old')];
    const replacement = subscription('https://push.example/one', 'new');

    expect(service.mergeSubscriptions(existing, replacement)).toEqual([
      replacement,
    ]);
  });

  it('ignores malformed subscription payloads', () => {
    const service = new PushNotificationService({
      get: jest.fn(),
    } as unknown as ConfigService);

    expect(
      service.mergeSubscriptions([], { endpoint: 'javascript:alert(1)' }),
    ).toEqual([]);
  });
});

function subscription(endpoint: string, auth: string) {
  return {
    endpoint,
    expirationTime: null,
    keys: { p256dh: 'public-key', auth },
  };
}
