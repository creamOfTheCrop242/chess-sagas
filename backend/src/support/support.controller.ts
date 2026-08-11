import {
  BadRequestException,
  Body,
  Controller,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  createSupportMessageSchema,
  type CreateSupportMessageDto,
} from './dto/create-support-message.dto';
import { SupportService } from './support.service';

@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  @Post('messages')
  async create(
    @Body() body: CreateSupportMessageDto,
    @Req() request: Request,
  ): Promise<{ accepted: true }> {
    const parsed = createSupportMessageSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException('Check the support form and try again');
    }
    return this.support.send(parsed.data, {
      ip: sourceIp(request),
      userAgent: request.get('user-agent')?.slice(0, 500),
    });
  }
}

function sourceIp(request: Request): string {
  const forwarded = request.get('x-forwarded-for');
  const forwardedIp = forwarded?.split(',').at(-1)?.trim();
  return forwardedIp || request.ip || request.socket.remoteAddress || 'unknown';
}
