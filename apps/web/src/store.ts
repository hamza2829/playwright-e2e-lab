import { randomBytes, randomUUID } from 'node:crypto';

/**
 * In-memory data store for the demo shop.
 *
 * Everything lives in process memory on purpose: the app is a system under test,
 * so a restart (or POST /api/test/reset) always gives a known, clean state.
 */

export type Role = 'customer' | 'admin';

export interface User {
  username: string;
  password: string;
  role: Role;
  displayName: string;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  category: string;
  /** Price in cents to avoid floating point rounding. */
  priceCents: number;
  stock: number;
}

export interface CartLine {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  username: string;
  createdAt: string;
  lines: Array<{ productId: string; name: string; quantity: number; priceCents: number }>;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  shipTo: { fullName: string; address: string; postalCode: string };
  paymentMethod: PaymentMethod;
}

export type PaymentMethod = 'invoice' | 'cash-on-delivery';
export const PAYMENT_METHODS: PaymentMethod[] = ['invoice', 'cash-on-delivery'];

export const FREE_SHIPPING_THRESHOLD_CENTS = 5000;
export const SHIPPING_FEE_CENTS = 499;

const SEED_USERS: User[] = [
  { username: 'alice', password: 'alice123', role: 'customer', displayName: 'Alice' },
  { username: 'admin', password: 'admin123', role: 'admin', displayName: 'Shop Admin' },
];

const SEED_PRODUCTS: Product[] = [
  { id: 'p-1001', name: 'Mechanical Keyboard', description: 'Tactile switches, USB-C.', category: 'Peripherals', priceCents: 7999, stock: 999 },
  { id: 'p-1002', name: 'Wireless Mouse', description: 'Ergonomic, 2.4 GHz.', category: 'Peripherals', priceCents: 2499, stock: 999 },
  { id: 'p-1003', name: 'USB-C Hub', description: '7 ports, 100 W pass-through.', category: 'Accessories', priceCents: 3499, stock: 999 },
  { id: 'p-1004', name: 'Laptop Stand', description: 'Aluminium, adjustable height.', category: 'Accessories', priceCents: 2999, stock: 999 },
  { id: 'p-1005', name: '27" Monitor', description: '1440p IPS panel.', category: 'Displays', priceCents: 22999, stock: 999 },
  { id: 'p-1006', name: 'Webcam HD', description: '1080p with privacy shutter.', category: 'Peripherals', priceCents: 4599, stock: 999 },
  { id: 'p-1007', name: 'Desk Mat', description: '90 x 40 cm, stitched edges.', category: 'Accessories', priceCents: 1499, stock: 999 },
  { id: 'p-1008', name: 'Noise-Cancelling Headphones', description: 'Over-ear, 30 h battery.', category: 'Audio', priceCents: 14999, stock: 999 },
];

export class Store {
  users = new Map<string, User>();
  sessions = new Map<string, string>();
  products = new Map<string, Product>();
  carts = new Map<string, CartLine[]>();
  orders: Order[] = [];

  constructor() {
    this.reset();
  }

  reset(): void {
    this.users = new Map(SEED_USERS.map((u) => [u.username, { ...u }]));
    this.sessions = new Map();
    this.products = new Map(SEED_PRODUCTS.map((p) => [p.id, { ...p }]));
    this.carts = new Map();
    this.orders = [];
  }

  login(username: string, password: string): { token: string; user: PublicUser } | null {
    const user = this.users.get(username);
    if (!user || user.password !== password) return null;
    const token = randomBytes(24).toString('hex');
    this.sessions.set(token, user.username);
    return { token, user: toPublicUser(user) };
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }

  userForToken(token: string | undefined): User | undefined {
    if (!token) return undefined;
    const username = this.sessions.get(token);
    return username ? this.users.get(username) : undefined;
  }

  createUser(role: Role, prefix = 'user'): User {
    const suffix = randomBytes(4).toString('hex');
    const user: User = {
      username: `${prefix}-${suffix}`,
      password: `pw-${randomBytes(6).toString('hex')}`,
      role,
      displayName: `${role === 'admin' ? 'Admin' : 'Customer'} ${suffix}`,
    };
    this.users.set(user.username, user);
    return user;
  }

  deleteUser(username: string): boolean {
    if (SEED_USERS.some((u) => u.username === username)) return false;
    const existed = this.users.delete(username);
    this.carts.delete(username);
    this.orders = this.orders.filter((o) => o.username !== username);
    for (const [token, owner] of this.sessions) if (owner === username) this.sessions.delete(token);
    return existed;
  }

  listProducts(): Product[] {
    return [...this.products.values()];
  }

  createProduct(input: Omit<Product, 'id'>): Product {
    const product: Product = { ...input, id: `p-${randomUUID().slice(0, 8)}` };
    this.products.set(product.id, product);
    return product;
  }

  deleteProduct(id: string): boolean {
    const existed = this.products.delete(id);
    for (const [owner, lines] of this.carts) this.carts.set(owner, lines.filter((l) => l.productId !== id));
    return existed;
  }

  getCart(username: string): CartLine[] {
    return this.carts.get(username) ?? [];
  }

  setCartQuantity(username: string, productId: string, quantity: number): CartLine[] {
    const lines = this.getCart(username).filter((l) => l.productId !== productId);
    if (quantity > 0) lines.push({ productId, quantity });
    lines.sort((a, b) => a.productId.localeCompare(b.productId));
    this.carts.set(username, lines);
    return lines;
  }

  addToCart(username: string, productId: string, quantity: number): CartLine[] {
    const current = this.getCart(username).find((l) => l.productId === productId)?.quantity ?? 0;
    return this.setCartQuantity(username, productId, current + quantity);
  }

  cartSummary(username: string) {
    const lines = this.getCart(username)
      .map((l) => {
        const p = this.products.get(l.productId);
        return p ? { productId: p.id, name: p.name, quantity: l.quantity, priceCents: p.priceCents, lineTotalCents: p.priceCents * l.quantity } : null;
      })
      .filter((l): l is NonNullable<typeof l> => l !== null);
    const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
    const shippingCents = subtotalCents === 0 || subtotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FEE_CENTS;
    return {
      lines,
      itemCount: lines.reduce((sum, l) => sum + l.quantity, 0),
      subtotalCents,
      shippingCents,
      totalCents: subtotalCents + shippingCents,
    };
  }

  checkout(username: string, shipTo: Order['shipTo'], paymentMethod: PaymentMethod): Order | { error: string } {
    const summary = this.cartSummary(username);
    if (summary.lines.length === 0) return { error: 'Your cart is empty.' };
    for (const line of summary.lines) {
      const product = this.products.get(line.productId)!;
      if (product.stock < line.quantity) return { error: `Not enough stock for ${product.name}.` };
    }
    for (const line of summary.lines) this.products.get(line.productId)!.stock -= line.quantity;
    const order: Order = {
      id: `ORD-${randomBytes(3).toString('hex').toUpperCase()}`,
      username,
      createdAt: new Date().toISOString(),
      lines: summary.lines.map(({ productId, name, quantity, priceCents }) => ({ productId, name, quantity, priceCents })),
      subtotalCents: summary.subtotalCents,
      shippingCents: summary.shippingCents,
      totalCents: summary.totalCents,
      shipTo,
      paymentMethod,
    };
    this.orders.push(order);
    this.carts.set(username, []);
    return order;
  }
}

export type PublicUser = Pick<User, 'username' | 'role' | 'displayName'>;

export function toPublicUser(user: User): PublicUser {
  return { username: user.username, role: user.role, displayName: user.displayName };
}
