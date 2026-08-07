import type { Request } from 'express';

export const SESSION_COOKIE = 'chess_sagas_session';

export function readCookie(
  request: Pick<Request, 'headers'>,
  name: string,
): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;

  for (const pair of cookieHeader.split(';')) {
    const separator = pair.indexOf('=');
    if (separator < 0) continue;
    if (pair.slice(0, separator).trim() === name) {
      return decodeURIComponent(pair.slice(separator + 1).trim());
    }
  }

  return undefined;
}
