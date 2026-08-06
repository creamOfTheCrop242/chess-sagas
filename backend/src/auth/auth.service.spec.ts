import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  const configValues: Record<string, string> = {
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    GOOGLE_CALLBACK_URL: 'http://localhost:3000/auth/google/callback',
    APPLE_CLIENT_ID: 'com.example.chesssagas.web',
    APPLE_CALLBACK_URL: 'https://chesssagas.com/api/auth/apple/callback',
    PUBLIC_APP_URL: 'http://localhost:4200/',
  };
  const config = {
    get: jest.fn((name: string) => configValues[name]),
  } as unknown as ConfigService;
  const prisma = {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    authSession: {
      create: jest.fn(),
      findFirst: jest.fn(),
      deleteMany: jest.fn(),
    },
  };
  const service = new AuthService(config, prisma as never);

  beforeEach(() => jest.clearAllMocks());

  afterEach(() => jest.restoreAllMocks());

  it('creates a Google authorization URL with an unpredictable state', () => {
    const request = service.createAuthorizationRequest();
    const url = new URL(request.url);

    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('client_id')).toBe('client-id');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://localhost:3000/auth/google/callback',
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe(request.state);
    expect(request.state.length).toBeGreaterThan(30);
  });

  it('creates an Apple form-post authorization URL', () => {
    const request = service.createAppleAuthorizationRequest();
    const url = new URL(request.url);

    expect(url.origin).toBe('https://appleid.apple.com');
    expect(url.searchParams.get('client_id')).toBe(
      'com.example.chesssagas.web',
    );
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://chesssagas.com/api/auth/apple/callback',
    );
    expect(url.searchParams.get('response_mode')).toBe('form_post');
    expect(url.searchParams.get('scope')).toBe('name email');
    expect(url.searchParams.get('state')).toBe(request.state);
  });

  it('returns no user when the session cookie is absent', async () => {
    await expect(service.currentUser(undefined)).resolves.toBeNull();
    expect(prisma.authSession.findFirst).not.toHaveBeenCalled();
  });

  it('rejects a callback whose state does not match before calling Google', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      service.completeGoogleLogin('code', 'returned-state', 'expected-state'),
    ).rejects.toThrow('Invalid Google authentication response');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('rejects an Apple callback whose state does not match before calling Apple', async () => {
    const fetchSpy = jest.spyOn(global, 'fetch');
    await expect(
      service.completeAppleLogin(
        'code',
        'returned-state',
        'expected-state',
        undefined,
      ),
    ).rejects.toThrow('Invalid Apple authentication response');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('creates a user and a hashed server-side session after Google authentication', async () => {
    const authorization = service.createAuthorizationRequest();
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'google-access-token' }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: 'google-subject',
            email: 'reader@example.com',
            email_verified: true,
            name: 'Saga Reader',
            picture: 'https://example.com/avatar.png',
          }),
          { status: 200 },
        ),
      );
    const user = {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Saga Reader',
      avatarUrl: 'https://example.com/avatar.png',
    };
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockResolvedValue(user);
    prisma.authSession.create.mockResolvedValue({ id: 'session-1' });

    const result = await service.completeGoogleLogin(
      'authorization-code',
      authorization.state,
      authorization.state,
    );

    expect(result.user).toEqual(user);
    expect(result.sessionToken).toHaveLength(43);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(prisma.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
        userId: 'user-1',
        expiresAt: expect.any(Date),
      }),
    });
    expect(prisma.authSession.create.mock.calls[0][0].data.tokenHash).not.toBe(
      result.sessionToken,
    );
  });

  it('loads the user belonging to a live session', async () => {
    const user = {
      id: 'user-1',
      email: 'reader@example.com',
      displayName: 'Reader',
      avatarUrl: null,
    };
    prisma.authSession.findFirst.mockResolvedValue({ user });

    await expect(service.currentUser('session-token')).resolves.toEqual(user);
    expect(prisma.authSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ expiresAt: { gt: expect.any(Date) } }),
      }),
    );
  });

  it('removes the server-side session during logout', async () => {
    prisma.authSession.deleteMany.mockResolvedValue({ count: 1 });
    await service.logout('session-token');
    expect(prisma.authSession.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('normalizes the configured public app URL', () => {
    expect(service.appUrl).toBe('http://localhost:4200');
  });
});
