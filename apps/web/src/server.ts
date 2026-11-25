import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PAYMENT_METHODS, Store, toPublicUser, type PaymentMethod, type Role, type User } from './store.ts';

/**
 * Demo shop: Express JSON API + static single-page frontend.
 *
 * Environment variables:
 *   PORT              port to listen on (default 3100)
 *   ENABLE_TEST_API   set to "0" to disable the /api/test/* helpers (default: enabled)
 *   CART_LATENCY_MS   artificial delay for POST /api/cart, used by the failure drill
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(here, '..', 'public');

export function createApp(store = new Store()) {
  const app = express();
  app.use(express.json());

  const cartLatencyMs = Number(process.env.CART_LATENCY_MS ?? 0);
  const testApiEnabled = process.env.ENABLE_TEST_API !== '0';

  type AuthedRequest = Request & { user?: User; token?: string };

  const authenticate = (req: AuthedRequest, res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
    const user = store.userForToken(token);
    if (!user) {
      res.status(401).json({ error: 'Authentication required.' });
      return;
    }
    req.user = user;
    req.token = token;
    next();
  };

  const requireAdmin = (req: AuthedRequest, res: Response, next: NextFunction) => {
    if (req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required.' });
      return;
    }
    next();
  };

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- auth -----------------------------------------------------------------
  app.post('/api/login', (req, res) => {
    const { username, password } = req.body ?? {};
    const session = typeof username === 'string' && typeof password === 'string' ? store.login(username, password) : null;
    if (!session) {
      res.status(401).json({ error: 'Invalid username or password.' });
      return;
    }
    res.json(session);
  });

  app.post('/api/logout', authenticate, (req: AuthedRequest, res) => {
    store.logout(req.token!);
    res.status(204).end();
  });

  app.get('/api/me', authenticate, (req: AuthedRequest, res) => {
    res.json(toPublicUser(req.user!));
  });

  // --- catalog --------------------------------------------------------------
  app.get('/api/products', (req, res) => {
    const q = String(req.query.q ?? '').trim().toLowerCase();
    const products = store.listProducts().filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    res.json(products);
  });

  // --- cart -----------------------------------------------------------------
  app.get('/api/cart', authenticate, (req: AuthedRequest, res) => {
    res.json(store.cartSummary(req.user!.username));
  });

  app.post('/api/cart', authenticate, async (req: AuthedRequest, res) => {
    const { productId, quantity = 1 } = req.body ?? {};
    const product = store.products.get(productId);
    if (!product) {
      res.status(404).json({ error: 'Unknown product.' });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      res.status(400).json({ error: 'Quantity must be a positive whole number.' });
      return;
    }
    if (product.stock < 1) {
      res.status(409).json({ error: `${product.name} is out of stock.` });
      return;
    }
    if (cartLatencyMs > 0) await new Promise((r) => setTimeout(r, cartLatencyMs));
    store.addToCart(req.user!.username, productId, quantity);
    res.status(201).json(store.cartSummary(req.user!.username));
  });

  app.put('/api/cart/:productId', authenticate, (req: AuthedRequest, res) => {
    const quantity = Number(req.body?.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      res.status(400).json({ error: 'Quantity must be zero or a positive whole number.' });
      return;
    }
    store.setCartQuantity(req.user!.username, String(req.params.productId), quantity);
    res.json(store.cartSummary(req.user!.username));
  });

  app.delete('/api/cart/:productId', authenticate, (req: AuthedRequest, res) => {
    store.setCartQuantity(req.user!.username, String(req.params.productId), 0);
    res.json(store.cartSummary(req.user!.username));
  });

  // --- checkout & orders ----------------------------------------------------
  app.post('/api/checkout', authenticate, (req: AuthedRequest, res) => {
    const { fullName, address, postalCode, paymentMethod } = req.body ?? {};
    const errors: Record<string, string> = {};
    if (typeof fullName !== 'string' || fullName.trim().length < 2) errors.fullName = 'Enter your full name.';
    if (typeof address !== 'string' || address.trim().length < 5) errors.address = 'Enter a delivery address.';
    if (typeof postalCode !== 'string' || !/^\d{5}$/.test(postalCode.trim())) errors.postalCode = 'Postal code must be 5 digits.';
    if (!PAYMENT_METHODS.includes(paymentMethod)) errors.paymentMethod = 'Choose a payment method.';
    if (Object.keys(errors).length > 0) {
      res.status(400).json({ error: 'Please fix the highlighted fields.', fields: errors });
      return;
    }
    const result = store.checkout(
      req.user!.username,
      { fullName: fullName.trim(), address: address.trim(), postalCode: postalCode.trim() },
      paymentMethod as PaymentMethod,
    );
    if ('error' in result) {
      res.status(409).json(result);
      return;
    }
    res.status(201).json(result);
  });

  app.get('/api/orders', authenticate, (req: AuthedRequest, res) => {
    res.json(store.orders.filter((o) => o.username === req.user!.username));
  });

  app.get('/api/orders/:id', authenticate, (req: AuthedRequest, res) => {
    const order = store.orders.find((o) => o.id === req.params.id);
    if (!order || (order.username !== req.user!.username && req.user!.role !== 'admin')) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    res.json(order);
  });

  // --- admin ----------------------------------------------------------------
  app.get('/api/admin/orders', authenticate, requireAdmin, (_req, res) => {
    res.json(store.orders);
  });

  app.post('/api/admin/products', authenticate, requireAdmin, (req, res) => {
    const { name, description = '', category = 'Misc', priceCents, stock } = req.body ?? {};
    if (typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ error: 'Name is required.' });
      return;
    }
    if (!Number.isInteger(priceCents) || priceCents <= 0 || !Number.isInteger(stock) || stock < 0) {
      res.status(400).json({ error: 'Price must be positive and stock zero or more.' });
      return;
    }
    res.status(201).json(store.createProduct({ name: name.trim(), description, category, priceCents, stock }));
  });

  app.delete('/api/admin/products/:id', authenticate, requireAdmin, (req, res) => {
    res.status(store.deleteProduct(String(req.params.id)) ? 204 : 404).end();
  });

  // --- test support (data setup & teardown for the E2E suite) --------------
  if (testApiEnabled) {
    app.post('/api/test/users', (req, res) => {
      const role: Role = req.body?.role === 'admin' ? 'admin' : 'customer';
      const user = store.createUser(role, String(req.body?.prefix ?? role));
      res.status(201).json({ ...toPublicUser(user), password: user.password });
    });
    app.delete('/api/test/users/:username', (req, res) => {
      res.status(store.deleteUser(String(req.params.username)) ? 204 : 404).end();
    });
    app.post('/api/test/reset', (_req, res) => {
      store.reset();
      res.status(204).end();
    });
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.' });
  });

  app.use(express.static(publicDir));
  app.get('/{*splat}', (_req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
  });

  return app;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT ?? 3100);
  createApp().listen(port, () => {
    console.log(`Demo shop listening on http://localhost:${port}`);
  });
}
