import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service';
import { readCookie, SESSION_COOKIE } from '../auth/session-cookie';
import { parseSagaListQuery } from './community-query';
import type { SagaListQuery } from './community-query';
import { ProfilesService } from './profiles.service';
import type { UpdateProfileInput } from './profiles.service';
import { SagasService } from './sagas.service';

@Controller('profiles')
export class ProfilesController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly sagas: SagasService,
    private readonly auth: AuthService,
  ) {}

  @Get('me')
  async mine(@Req() request: Request) {
    const user = await this.requireUser(request);
    return this.profiles.getOrCreate(user.id);
  }

  @Patch('me')
  async update(@Body() body: UpdateProfileInput, @Req() request: Request) {
    const user = await this.requireUser(request);
    return this.profiles.update(user.id, body ?? {});
  }

  @Get(':handle/sagas')
  async sagasByCreator(
    @Param('handle') handle: string,
    @Query() query: SagaListQuery,
  ) {
    const profile = await this.profiles.getPublic(handle);
    if (!profile.showCreatorCredit) {
      return { items: [], nextCursor: null };
    }
    return this.sagas.listPublic(
      parseSagaListQuery({ ...query, creator: profile.handle }),
    );
  }

  @Get(':handle')
  findOne(@Param('handle') handle: string) {
    return this.profiles.getPublic(handle);
  }

  private async requireUser(request: Request) {
    const user = await this.auth.currentUser(
      readCookie(request, SESSION_COOKIE),
    );
    if (!user)
      throw new UnauthorizedException('Sign in to manage your profile');
    return user;
  }
}
