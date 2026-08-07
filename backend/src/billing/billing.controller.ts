import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { BillingService } from './billing.service';
import {
  createCheckoutSchema,
  type CreateCheckoutDto,
} from './dto/create-checkout.dto';

@Controller('billing')
export class BillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly auth: AuthService,
  ) {}

  @Get('status')
  async status(@Req() request: Request) {
    const userId = await this.requireUserId(request);
    return this.billing.status(userId);
  }

  @Post('checkout')
  async checkout(@Req() request: Request, @Body() body: CreateCheckoutDto) {
    const parsed = createCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Select a valid billing product');
    }
    const userId = await this.requireUserId(request);
    return this.billing.createCheckout(userId, parsed.data.product);
  }

  @Post('portal')
  async portal(@Req() request: Request) {
    const userId = await this.requireUserId(request);
    return this.billing.createPortal(userId);
  }

  @Post('webhook')
  async webhook(
    @Req() request: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string | undefined,
  ): Promise<{ received: true; duplicate?: true }> {
    return this.billing.handleWebhook(request.rawBody, signature);
  }

  private async requireUserId(request: Request): Promise<string> {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    if (!user) throw new UnauthorizedException('Sign in to manage billing');
    return user.id;
  }
}
