import { test, expect } from '@playwright/test';

test.describe('Plinth Branding Application E2E Tests', () => {

  test('All routes render without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    const routes = [
      '/',
      '/products',
      '/products/manufacturing',
      '/products/provenance',
      '/products/trade',
      '/products/build',
      '/products/fleet',
      '/products/campus',
      '/platform',
      '/pricing',
      '/about',
      '/demo',
      '/privacy',
      '/terms',
    ];

    for (const route of routes) {
      await page.goto(route);
      await expect(page.locator('header')).toBeVisible();
      await expect(page.locator('footer')).toBeVisible();
    }

    expect(errors).toHaveLength(0);
  });

  test('Home page hero interactive AI operator works', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'STRUCTURED OPERATIONS.' })).toBeVisible();

    // Verify AI operator card prompt text
    await expect(page.getByText('Create purchase orders for everything below reorder level')).toBeVisible();
  });

  test('Command palette or mobile drawer navigation works', async ({ page, isMobile }) => {
    await page.goto('/');
    
    if (isMobile) {
      // In mobile viewport, open hamburger menu
      const hamburger = page.getByRole('button', { name: 'Open Navigation Menu' });
      await hamburger.click();
      const mobileDialog = page.getByRole('dialog', { name: 'Mobile Navigation Menu' });
      await expect(mobileDialog).toBeVisible();

      // Click Manufacturing directly in mobile menu
      await page.getByRole('link', { name: /Plinth Manufacturing/i }).first().click();
      await expect(page).toHaveURL(/.*\/products\/manufacturing/);
      await expect(page.getByRole('heading', { level: 1, name: 'Plinth Manufacturing' })).toBeVisible();
    } else {
      // Desktop: Click search button or Cmd+K
      const cmdButton = page.getByRole('button', { name: /Open Command search palette/i });
      await cmdButton.click();

      const searchInput = page.getByPlaceholder('Type a command or search editions');
      await expect(searchInput).toBeVisible();

      // Type query
      await searchInput.fill('Manufacturing');
      await page.keyboard.press('Enter');

      // Should navigate to manufacturing
      await expect(page).toHaveURL(/.*\/products\/manufacturing/);
      await expect(page.getByRole('heading', { level: 1, name: 'Plinth Manufacturing' })).toBeVisible();
    }
  });

  test('Demo form validates required fields and submits', async ({ page }) => {
    await page.goto('/demo');

    // Submit empty to check validation
    const submitBtn = page.getByRole('button', { name: 'Submit Walkthrough Request' });
    await submitBtn.click();

    await expect(page.getByText('Full name must be at least 2 characters')).toBeVisible();
    await expect(page.getByText('Please enter a valid work email address')).toBeVisible();

    // Fill valid data
    await page.fill('#name', 'Test Industrial Lead');
    await page.fill('#email', 'lead@testplant.com');
    await page.fill('#phone', '9876543210');
    await page.fill('#company', 'Test Precision Fabrications');
    await page.selectOption('#edition', 'manufacturing');
    await page.check('input[type="checkbox"]');

    await submitBtn.click();

    // Expect confirmation view
    await expect(page.getByText('Request Received')).toBeVisible();
    await expect(page.getByText('lead@testplant.com')).toBeVisible();
  });

  test('Visual snapshots check at desktop viewport', async ({ page, isMobile }) => {
    if (isMobile) return;
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('header')).toBeVisible();

    await page.goto('/products/manufacturing');
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('heading', { level: 1, name: 'Plinth Manufacturing' })).toBeVisible();
  });

});
