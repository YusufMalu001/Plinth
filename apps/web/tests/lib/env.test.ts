import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getEmployeeOnboardingLink } from '@/lib/env';

describe('getAppBaseUrl and getEmployeeOnboardingLink', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXT_PUBLIC_WEB_URL;
    delete process.env.NEXT_PUBLIC_STAGING_APP_URL;
    delete process.env.NEXT_PUBLIC_STAGING_WEB_URL;
    delete process.env.NEXT_PUBLIC_PRODUCTION_APP_URL;
    delete process.env.NEXT_PUBLIC_PRODUCTION_WEB_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('generates staging link when NEXT_PUBLIC_STAGING_APP_URL is set in staging env', () => {
    (process.env as any).NODE_ENV = 'staging';
    process.env.NEXT_PUBLIC_STAGING_APP_URL = 'https://staging.synergy.example.com';

    const link = getEmployeeOnboardingLink('amit.s@synergy.local');
    expect(link).toBe('https://staging.synergy.example.com/login?email=amit.s%40synergy.local');
  });

  it('generates production link when NEXT_PUBLIC_PRODUCTION_APP_URL is set in production env', () => {
    (process.env as any).NODE_ENV = 'production';
    process.env.NEXT_PUBLIC_PRODUCTION_APP_URL = 'https://app.synergy.example.com';

    const link = getEmployeeOnboardingLink('amit.s@synergy.local');
    expect(link).toBe('https://app.synergy.example.com/login?email=amit.s%40synergy.local');
  });

  it('appends next query parameter when provided for wizard onboarding continuation', () => {
    (process.env as any).NODE_ENV = 'staging';
    process.env.NEXT_PUBLIC_STAGING_APP_URL = 'https://staging.synergy.example.com';

    const invitePath = '/onboarding?token=tok123&email=amit.s%40synergy.local';
    const link = getEmployeeOnboardingLink('amit.s@synergy.local', invitePath);
    expect(link).toBe(
      `https://staging.synergy.example.com/login?email=amit.s%40synergy.local&next=${encodeURIComponent(invitePath)}`
    );
  });

  it('falls back to localhost:3000 in local development environment when no env vars configured', () => {
    (process.env as any).NODE_ENV = 'development';
    const link = getEmployeeOnboardingLink('amit.s@synergy.local');
    expect(link).toBe('http://localhost:3000/login?email=amit.s%40synergy.local');
  });
});
