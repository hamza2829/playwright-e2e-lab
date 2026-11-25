// Drafted by the genai helper (mock adapter) from genai/stories/login-error.md.
// Reviewed against genai/REVIEW_CHECKLIST.md. Changes made in review:
// - R7: replaced the raw page.getByText() lookup with the LoginPage error locator and an exact text match.
// - R4/R5: the "still on the login page" step had no assertion; added a URL check.
import { test, expect } from '../fixtures.ts';

test.describe('Helpful login errors', () => {
  test('Wrong password is rejected', { tag: '@regression' }, async ({ loginPage, page }) => {
    // Given I am not logged in
    // When I sign in as "alice" with password "wrong-password"
    await loginPage.goto();
    await loginPage.login('alice', 'wrong-password');
    // Then I see the error "Invalid username or password."
    await expect(loginPage.error).toHaveText('Invalid username or password.');
    // And I am still on the login page
    await expect(page).toHaveURL(/#\/login$/);
  });
});
