import { UnauthorizedError } from '../../common/errors/AppError';
import {
  hashRefreshToken,
  signAccessToken,
  signRefreshToken,
  tokenHashesMatch,
  verifyAccessToken,
  verifyRefreshToken
} from './auth.tokens';

const user = { id: 'user-1', email: 'admin@synergy.com', role: 'admin' as const };

describe('authentication tokens', () => {
  it('signs and verifies access tokens with the expected claims', () => {
    const payload = verifyAccessToken(signAccessToken(user));
    expect(payload).toEqual(expect.objectContaining({
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access'
    }));
  });

  it('signs refresh tokens for a specific session', () => {
    const payload = verifyRefreshToken(signRefreshToken(user, 'session-1'));
    expect(payload.jti).toBe('session-1');
    expect(payload.type).toBe('refresh');
  });

  it('does not accept a refresh token as an access token', () => {
    expect(() => verifyAccessToken(signRefreshToken(user, 'session-1'))).toThrow(UnauthorizedError);
  });

  it('compares only hashed refresh token values', () => {
    const first = hashRefreshToken('first-token');
    expect(tokenHashesMatch(first, hashRefreshToken('first-token'))).toBe(true);
    expect(tokenHashesMatch(first, hashRefreshToken('different-token'))).toBe(false);
  });
});
