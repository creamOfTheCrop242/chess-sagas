import { Controller, Get } from '@nestjs/common';
import { PushNotificationService } from './push-notification.service';

@Controller('push')
export class PushNotificationController {
  constructor(private readonly push: PushNotificationService) {}

  @Get('public-key')
  publicKey(): { publicKey: string } {
    return { publicKey: this.push.getPublicKey() };
  }
}
