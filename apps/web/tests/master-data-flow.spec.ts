import { test, expect } from '@playwright/test';

test.describe('Master Data Lifecycle Flow', () => {
  test.skip('creates, submits, and approves a product', async ({ page }) => {
    // 1. Navigate to Products List
    await page.goto('/products');
    await expect(page.locator('h1')).toHaveText('Products');

    // 2. Click Create
    await page.click('text=Create Product');
    await expect(page.locator('h1')).toHaveText('Create Product');

    // 3. Fill form
    const code = `TEST-PROD-${Date.now()}`;
    await page.fill('input[name="code"]', code);
    await page.fill('input[name="name"]', 'Test Product Name');
    await page.fill('input[name="description"]', 'E2E test description');
    await page.fill('input[name="familyId"]', 'FAM-1');
    await page.fill('input[name="baseUnitId"]', 'EA');
    
    // 4. Save (creates DRAFT)
    await page.click('button:has-text("Save")');

    // Wait for navigation back to list
    await expect(page.locator('h1')).toHaveText('Products');

    // 5. Navigate to detail view
    // Since we don't know the ID, we could find the row by code
    const row = page.locator(`tr:has-text("${code}")`);
    await row.locator('text=View / Edit').click();

    // Verify DRAFT status
    await expect(page.locator('text=Draft')).toBeVisible();

    // 6. Submit for validation
    await page.click('button:has-text("Submit for Validation")');

    // Wait for status to change
    await expect(page.locator('text=Pending Validation')).toBeVisible();

    // 7. Approve
    // Assuming the test user has permission and the ApprovalFlow is visible
    await page.fill('textarea', 'LGTM from E2E');
    await page.click('button:has-text("Approve Record")');

    // Wait for status to change to APPROVED
    await expect(page.locator('text=Approved')).toBeVisible();
  });
});
