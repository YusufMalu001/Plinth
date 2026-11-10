import request from 'supertest';
import app from '../../app';
import { authService } from './auth.service';
import { signAccessToken } from './auth.tokens';

jest.mock('./auth.service', () => ({
  authService: {
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    currentUser: jest.fn(),
    listUsers: jest.fn(),
    createUser: jest.fn(),
    updateStatus: jest.fn()
  }
}));

const user = {
  id: 'ed0f30ea-a332-4db7-9314-b4cd78bc80fe',
  email: 'admin@synergy.com',
  name: 'System Admin',
  role: 'admin' as const,
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date().toISOString()
};

describe('authentication routes', () => {
  it('sets HttpOnly access and refresh cookies after login', async () => {
    (authService.login as jest.Mock).mockResolvedValue({
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
      user
    });

    const response = await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: user.email, password: 'Admin123!' })
      .expect(200);

    expect(response.body.data.user).toEqual(user);
    expect(response.headers['set-cookie']).toEqual(expect.arrayContaining([
      expect.stringContaining('synergy_access=access-token'),
      expect.stringContaining('synergy_refresh=refresh-token')
    ]));
    const cookies = response.headers['set-cookie'] as unknown as string[];
    expect(cookies.every((cookie: string) => cookie.includes('HttpOnly'))).toBe(true);
  });

  it('rejects malformed login input before the service runs', async () => {
    await request(app).post('/api/v1/auth/login').send({ email: 'invalid' }).expect(400);
    expect(authService.login).not.toHaveBeenCalled();
  });

  it('rejects unsafe cross-origin login requests', async () => {
    await request(app)
      .post('/api/v1/auth/login')
      .set('Origin', 'https://attacker.example')
      .send({ email: user.email, password: 'Admin123!' })
      .expect(403);
  });

  it('returns the current user for a valid access cookie', async () => {
    (authService.currentUser as jest.Mock).mockResolvedValue(user);
    const token = signAccessToken(user);
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', [`synergy_access=${token}`])
      .expect(200);
    expect(response.body.data.user.email).toBe(user.email);
  });

  it('requires authentication for admin user endpoints', async () => {
    await request(app).get('/api/v1/users').expect(401);
  });
});
