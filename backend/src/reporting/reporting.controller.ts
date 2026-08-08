import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { ReportingService } from './reporting.service';

@Controller('admin/reports')
export class ReportingController {
  constructor(
    private readonly reporting: ReportingService,
    private readonly auth: AuthService,
  ) {}

  @Get('overview')
  async overview(
    @Req() request: Request,
    @Query('from') fromValue?: string,
    @Query('to') toValue?: string,
    @Query('days') daysValue?: string,
  ) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    if (!user) throw new UnauthorizedException('Sign in to view reporting');
    this.reporting.assertAdmin(user.email);
    return this.reporting.overview(parseRange(fromValue, toValue, daysValue));
  }
}

function parseRange(
  fromValue?: string,
  toValue?: string,
  daysValue?: string,
): { from: Date; to: Date } {
  const to = toValue ? new Date(toValue) : new Date();
  const days = daysValue === undefined ? 30 : Number(daysValue);
  const from = fromValue
    ? new Date(fromValue)
    : new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
  if (
    Number.isNaN(from.getTime()) ||
    Number.isNaN(to.getTime()) ||
    !Number.isFinite(days) ||
    days <= 0 ||
    days > 366 ||
    from >= to ||
    to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000
  ) {
    throw new BadRequestException(
      'Select a valid reporting range of no more than 366 days',
    );
  }
  return { from, to };
}
