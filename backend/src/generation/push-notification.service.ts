import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PushSubscription } from 'web-push';
import * as webPush from 'web-push';

@Injectable()
export class PushNotificationService {
  private readonly logger = new Logger(PushNotificationService.name);
  private readonly publicKey: string | undefined;
  private readonly configured: boolean;

  constructor(config: ConfigService) {
    this.publicKey = config.get<string>('VAPID_PUBLIC_KEY')?.trim();
    const privateKey = config.get<string>('VAPID_PRIVATE_KEY')?.trim();
    const subject = config.get<string>('VAPID_SUBJECT')?.trim();
    this.configured = Boolean(this.publicKey && privateKey && subject);
    if (this.configured) {
      webPush.setVapidDetails(subject!, this.publicKey!, privateKey!);
    }
  }

  getPublicKey(): string {
    if (!this.configured || !this.publicKey) {
      throw new ServiceUnavailableException(
        'Push notifications are not configured',
      );
    }
    return this.publicKey;
  }

  mergeSubscriptions(existing: unknown, incoming: unknown): PushSubscription[] {
    const subscriptions = this.parseSubscriptions(existing);
    const candidate = this.parseSubscription(incoming);
    if (!candidate) return subscriptions;
    return [
      ...subscriptions.filter((item) => item.endpoint !== candidate.endpoint),
      candidate,
    ];
  }

  async sendSagaReady(subscriptions: unknown, gameId: string): Promise<void> {
    await this.send(
      subscriptions,
      {
        title: 'Your saga is ready',
        body: 'The chronicler has finished forging your Chess Saga.',
        tag: `saga-progress-${gameId}`,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: {
          gameId,
          onActionClick: {
            default: {
              operation: 'openWindow',
              url: `/records/${gameId}`,
            },
          },
        },
      },
      'completion',
      60 * 60,
    );
  }

  async sendSagaStage(
    subscriptions: unknown,
    gameId: string,
    stage:
      | 'NARRATIVE_ANALYSIS'
      | 'OUTLINE'
      | 'STORY'
      | 'VALIDATION'
      | 'SCENE_BREAKDOWN',
  ): Promise<void> {
    const copy = {
      NARRATIVE_ANALYSIS: {
        title: 'Forging your saga — Analyzing',
        body: 'The chronicler is studying the battle and its turning points.',
      },
      OUTLINE: {
        title: 'Forging your saga — Building outline',
        body: 'Acts, scenes, and character relationships are taking shape.',
      },
      STORY: {
        title: 'Forging your saga — Writing story',
        body: 'The chronicler is writing the full account of the battle.',
      },
      VALIDATION: {
        title: 'Forging your saga — Validating',
        body: 'The finished chronicle is being checked against the battle.',
      },
      SCENE_BREAKDOWN: {
        title: 'Forging your saga — Preparing replay',
        body: 'The final story beats are being aligned with the board.',
      },
    }[stage];

    await this.send(
      subscriptions,
      {
        ...copy,
        tag: `saga-progress-${gameId}`,
        renotify: false,
        silent: true,
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        data: {
          gameId,
          onActionClick: {
            default: {
              operation: 'openWindow',
              url: '/',
            },
          },
        },
      },
      'stage',
      15 * 60,
    );
  }

  private async send(
    subscriptions: unknown,
    notification: Record<string, unknown>,
    kind: string,
    ttl: number,
  ): Promise<void> {
    if (!this.configured) return;
    const targets = this.parseSubscriptions(subscriptions);
    if (!targets.length) return;
    const payload = JSON.stringify({
      notification: {
        ...notification,
      },
    });
    const results = await Promise.allSettled(
      targets.map((subscription) =>
        webPush.sendNotification(subscription, payload, { TTL: ttl }),
      ),
    );
    results.forEach((result) => {
      if (result.status === 'rejected') {
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : 'unknown error';
        this.logger.warn(`Saga ${kind} push failed: ${message}`);
      }
    });
  }

  private parseSubscriptions(value: unknown): PushSubscription[] {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => this.parseSubscription(item))
      .filter((item): item is PushSubscription => Boolean(item));
  }

  private parseSubscription(value: unknown): PushSubscription | null {
    if (!value || typeof value !== 'object') return null;
    const candidate = value as Partial<PushSubscription>;
    if (
      typeof candidate.endpoint !== 'string' ||
      !candidate.endpoint.startsWith('https://') ||
      !candidate.keys ||
      typeof candidate.keys.p256dh !== 'string' ||
      typeof candidate.keys.auth !== 'string'
    ) {
      return null;
    }
    return {
      endpoint: candidate.endpoint,
      expirationTime: candidate.expirationTime ?? null,
      keys: {
        p256dh: candidate.keys.p256dh,
        auth: candidate.keys.auth,
      },
    };
  }
}
