import { expect, test } from '../web/fixtures.ts';

/**
 * FAILURE DRILL — deliberately broken test. Not part of the default run.
 *
 * Runs only through the "Failure drill" workflow (or `npm run test:drill`),
 * which sets DRILL=1 to enable the `drill` project and CART_LATENCY_MS=400 to
 * make the API behave like a slow production backend.
 *
 * The root cause analysis is in docs/failure-drill-rca.md.
 *
 * DRILL_VARIANT=broken (default) runs the original test; DRILL_VARIANT=fixed
 * runs the corrected version so the workflow can prove the fix.
 */

const variant = process.env.DRILL_VARIANT ?? 'broken';

test.use({ role: 'customer' });

test.describe('Failure drill: cart badge', () => {
  test('BROKEN: badge shows 1 after adding a product', { tag: '@drill' }, async ({ page, productsPage }) => {
    test.skip(variant !== 'broken', 'Running the fixed variant');
    await productsPage.goto();

    await productsPage.addButton('Wireless Mouse').click();

    // BUG: reads the badge text once, immediately after the click. The badge is
    // updated only after POST /api/cart returns, so under any real latency this
    // reads the old value "0". A plain `expect(value)` never retries.
    const badge = await page.getByTestId('cart-count').textContent();
    expect(badge).toBe('1');
  });

  test('FIXED: badge shows 1 after adding a product', { tag: '@drill' }, async ({ productsPage }) => {
    test.skip(variant !== 'fixed', 'Running the broken variant');
    await productsPage.goto();

    await productsPage.addButton('Wireless Mouse').click();

    // FIX: web-first assertion. Retries until the badge updates (or the expect timeout).
    await expect(productsPage.shell.cartCount).toHaveText('1');
  });
});
