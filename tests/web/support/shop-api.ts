import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Thin typed client for the demo shop API.
 * Used for fast test-data setup/teardown so UI tests only drive the UI they verify.
 */

export type Role = 'customer' | 'admin';

export interface TestUser {
  username: string;
  password: string;
  role: Role;
  displayName: string;
}

export interface Session {
  token: string;
  user: Omit<TestUser, 'password'>;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  priceCents: number;
  stock: number;
}

export interface CartSummary {
  lines: Array<{ productId: string; name: string; quantity: number; priceCents: number; lineTotalCents: number }>;
  itemCount: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
}

export interface Order {
  id: string;
  username: string;
  totalCents: number;
  lines: Array<{ productId: string; name: string; quantity: number; priceCents: number }>;
}

export class ShopApi {
  constructor(private readonly request: APIRequestContext) {}

  private auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async createUser(role: Role = 'customer'): Promise<TestUser> {
    const res = await this.request.post('/api/test/users', { data: { role, prefix: `e2e-${role}` } });
    expect(res.status(), 'create test user').toBe(201);
    return res.json();
  }

  async deleteUser(username: string): Promise<void> {
    const res = await this.request.delete(`/api/test/users/${encodeURIComponent(username)}`);
    expect([204, 404], 'delete test user').toContain(res.status());
  }

  async login(username: string, password: string): Promise<Session> {
    const res = await this.request.post('/api/login', { data: { username, password } });
    expect(res.status(), `login as ${username}`).toBe(200);
    return res.json();
  }

  async products(): Promise<Product[]> {
    const res = await this.request.get('/api/products');
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async productByName(name: string): Promise<Product> {
    const product = (await this.products()).find((p) => p.name === name);
    if (!product) throw new Error(`No product named "${name}"`);
    return product;
  }

  async addToCart(token: string, productId: string, quantity = 1): Promise<CartSummary> {
    const res = await this.request.post('/api/cart', { headers: this.auth(token), data: { productId, quantity } });
    expect(res.status(), 'add to cart').toBe(201);
    return res.json();
  }

  async cart(token: string): Promise<CartSummary> {
    const res = await this.request.get('/api/cart', { headers: this.auth(token) });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async orders(token: string): Promise<Order[]> {
    const res = await this.request.get('/api/orders', { headers: this.auth(token) });
    expect(res.ok()).toBeTruthy();
    return res.json();
  }

  async createProduct(adminToken: string, data: Omit<Product, 'id' | 'description'> & { description?: string }): Promise<Product> {
    const res = await this.request.post('/api/admin/products', { headers: this.auth(adminToken), data });
    expect(res.status(), 'create product').toBe(201);
    return res.json();
  }

  async deleteProduct(adminToken: string, id: string): Promise<void> {
    const res = await this.request.delete(`/api/admin/products/${encodeURIComponent(id)}`, { headers: this.auth(adminToken) });
    expect([204, 404], 'delete product').toContain(res.status());
  }
}

/** Unique, readable names so parallel workers never collide on shared server state. */
export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

export const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
