import { expect, type Locator, type Page } from '@playwright/test';

export interface ShippingDetails {
  fullName: string;
  address: string;
  postalCode: string;
  paymentMethod: 'Invoice' | 'Cash on delivery';
}

export const VALID_SHIPPING: ShippingDetails = {
  fullName: 'Test Customer',
  address: '1 Test Street, Testville',
  postalCode: '12345',
  paymentMethod: 'Invoice',
};

export type CheckoutField = 'fullName' | 'address' | 'postalCode' | 'paymentMethod';

export class CheckoutPage {
  readonly heading: Locator;
  readonly total: Locator;
  readonly error: Locator;
  readonly emptyCartAlert: Locator;
  readonly placeOrder: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Checkout' });
    this.total = page.getByTestId('checkout-total');
    this.error = page.getByTestId('checkout-error');
    this.emptyCartAlert = page.getByTestId('checkout-empty');
    this.placeOrder = page.getByRole('button', { name: 'Place order' });
  }

  async goto(): Promise<void> {
    await this.page.goto('/#/checkout');
    await expect(this.heading).toBeVisible();
  }

  async fill(details: Partial<ShippingDetails>): Promise<void> {
    if (details.fullName !== undefined) await this.page.getByLabel('Full name').fill(details.fullName);
    if (details.address !== undefined) await this.page.getByLabel('Address').fill(details.address);
    if (details.postalCode !== undefined) await this.page.getByLabel('Postal code').fill(details.postalCode);
    if (details.paymentMethod !== undefined) {
      await this.page.getByLabel('Payment method').selectOption({ label: details.paymentMethod });
    }
  }

  fieldError(field: CheckoutField): Locator {
    return this.page.locator(`[data-error-for="${field}"]`);
  }

  async submit(details: Partial<ShippingDetails> = VALID_SHIPPING): Promise<void> {
    await this.fill(details);
    await this.placeOrder.click();
  }
}

export class OrderConfirmationPage {
  readonly heading: Locator;
  readonly orderId: Locator;
  readonly total: Locator;

  constructor(readonly page: Page) {
    this.heading = page.getByRole('heading', { name: 'Thank you for your order!' });
    this.orderId = page.getByTestId('order-id');
    this.total = page.getByTestId('order-total');
  }

  /** Waits for the confirmation and returns the order id shown to the customer. */
  async expectConfirmed(): Promise<string> {
    await expect(this.heading).toBeVisible();
    await expect(this.orderId).toHaveText(/^ORD-[0-9A-F]{6}$/);
    return (await this.orderId.textContent())!;
  }
}
