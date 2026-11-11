import { NextFunction, Request, Response } from 'express';
import { config } from '../../config';
import { UnauthorizedError } from '../../common/errors/AppError';
import { ACCESS_COOKIE, REFRESH_COOKIE, LEGACY_ACCESS_COOKIE, LEGACY_REFRESH_COOKIE, accessCookiePath, refreshCookiePath } from './auth.constants';
import { authService } from './auth.service';

function isSecureCookie(req: Request): boolean {
  if (process.env.COOKIE_SECURE === 'false') return false;
  if (process.env.COOKIE_SECURE === 'true') return true;
  // If the web origin is plain HTTP (e.g. http://187.124.99.36:2000), do NOT set secure flag
  if (config.webOrigin.startsWith('http://')) return false;
  return req.secure || req.protocol === 'https' || req.get('x-forwarded-proto') === 'https';
}

function getCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: isSecureCookie(req),
    sameSite: 'lax' as const,
  };
}

function setAuthCookies(res: Response, req: Request, accessToken: string, refreshToken: string) {
  const common = getCookieOptions(req);
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...common,
    path: accessCookiePath,
    maxAge: config.accessTokenTtlMinutes * 60 * 1000
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...common,
    path: refreshCookiePath,
    maxAge: config.refreshTokenTtlDays * 24 * 60 * 60 * 1000
  });
  // Retire the pre-rebrand cookies so they do not linger after the next login.
  res.clearCookie(LEGACY_ACCESS_COOKIE, { ...common, path: accessCookiePath });
  res.clearCookie(LEGACY_REFRESH_COOKIE, { ...common, path: refreshCookiePath });
}

function clearAuthCookies(res: Response, req: Request) {
  const common = getCookieOptions(req);
  res.clearCookie(ACCESS_COOKIE, { ...common, path: accessCookiePath });
  res.clearCookie(REFRESH_COOKIE, { ...common, path: refreshCookiePath });
  res.clearCookie(LEGACY_ACCESS_COOKIE, { ...common, path: accessCookiePath });
  res.clearCookie(LEGACY_REFRESH_COOKIE, { ...common, path: refreshCookiePath });
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await authService.login({
      ...req.body,
      requestId: req.id,
      ipAddress: req.ip,
      userAgent: req.get('user-agent')
    });
    setAuthCookies(res, req, result.accessToken, result.refreshToken);
    res.status(200).json({
      success: true,
      data: { user: result.user, accessToken: result.accessToken },
      message: 'Login successful',
      requestId: req.id
    });
  } catch (error) {
    next(error);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const token = req.cookies?.[REFRESH_COOKIE] ?? req.cookies?.[LEGACY_REFRESH_COOKIE];
    if (!token) throw new UnauthorizedError('Session has expired');
    const result = await authService.refresh(token);
    setAuthCookies(res, req, result.accessToken, result.refreshToken);
    // Returning the short-lived access token lets same-origin clients recover
    // even when a reverse proxy does not forward Set-Cookie reliably. The
    // refresh token remains HttpOnly and is never exposed.
    res.status(200).json({ success: true, data: { user: result.user, accessToken: result.accessToken }, requestId: req.id });
  } catch (error) {
    clearAuthCookies(res, req);
    next(error);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await authService.logout(req.cookies?.[REFRESH_COOKIE] ?? req.cookies?.[LEGACY_REFRESH_COOKIE], req.id, req.ip);
    clearAuthCookies(res, req);
    res.status(200).json({ success: true, message: 'Logout successful', requestId: req.id });
  } catch (error) {
    clearAuthCookies(res, req);
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const user = await authService.currentUser(req.user.id);
    res.status(200).json({ success: true, data: { user }, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const user = await authService.updateMe(req.user.id, req.body, {
      requestId: req.id,
      ipAddress: req.ip
    });
    res.status(200).json({ success: true, data: { user }, requestId: req.id });
  } catch (error) {
    next(error);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new UnauthorizedError('Authentication required');
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      res.status(400).json({ success: false, error: { code: 'INVALID_PASSWORD', message: 'Password must be at least 6 characters' }, requestId: req.id });
      return;
    }
    const user = await authService.changePassword(req.user.id, newPassword);
    res.status(200).json({
      success: true,
      data: { user },
      message: 'Password updated successfully',
      requestId: req.id
    });
  } catch (error) {
    next(error);
  }
}
