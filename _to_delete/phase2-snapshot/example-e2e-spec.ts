import { test, expect } from '@playwright/test';

test.describe('1. Hub Landing Verification', () => {
  test('authenticates and loads the Hub dashboard successfully', async ({ page }) => {
    // 1. Navigate to the secured Hub page directly.
    await page.goto('/hub', { waitUntil: 'commit' });
    
    // 2. Ensure we are not redirected to /login.
    await expect(page).toHaveURL(/.*\/hub(\/.*)?/);

    // 3. Verify no application crash (Next.js Error Boundary text checks).
    await expect(page.getByText('Application Error', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Unhandled Runtime Error', { exact: true })).toHaveCount(0);
    await expect(page.getByText('An unexpected error has occurred', { exact: false })).toHaveCount(0);
  });
});
