// Lab Shop frontend: a tiny hash-routed single-page app with no build step.
// It is the system under test for the Playwright suite, so it exposes stable
// data-testid hooks and accessible roles/labels for locators.
'use strict';

const TOKEN_KEY = 'shop.token';
const USER_KEY = 'shop.user';
const view = document.getElementById('view');

const state = {
  get token() { return localStorage.getItem(TOKEN_KEY); },
  get user() {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
  },
  setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clear() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

// ---------------------------------------------------------------- helpers --
function esc(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (res.status === 401 && path !== '/login') {
    state.clear();
    go('#/login');
    throw new Error('Session expired. Please log in again.');
  }
  const data = res.status === 204 ? null : await res.json();
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.fields = data && data.fields;
    throw err;
  }
  return data;
}

let toastTimer;
function toast(message) {
  const el = document.querySelector('[data-testid="toast"]');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function setCartCount(count) {
  document.querySelector('[data-testid="cart-count"]').textContent = String(count);
}

async function refreshCartCount() {
  if (!state.token) return;
  try {
    const cart = await api('/cart');
    setCartCount(cart.itemCount);
  } catch { /* handled by api() */ }
}

function renderNav() {
  const nav = document.getElementById('nav');
  const user = state.user;
  nav.hidden = !user;
  if (!user) return;
  document.querySelector('[data-testid="current-user"]').textContent = `Signed in as ${user.displayName}`;
  document.querySelector('[data-testid="nav-admin"]').hidden = user.role !== 'admin';
}

// ------------------------------------------------------------------ views --
const routes = {
  login: renderLogin,
  products: renderProducts,
  cart: renderCart,
  checkout: renderCheckout,
  orders: renderOrders,
  order: renderOrder,
  admin: renderAdmin,
};

async function render() {
  const [, name = 'products', param] = location.hash.replace(/^#/, '').split('/');
  renderNav();
  if (name !== 'login' && !state.token) {
    sessionStorage.setItem('shop.returnTo', location.hash);
    go('#/login');
    return;
  }
  const route = routes[name] || renderNotFound;
  try {
    await route(param);
  } catch (err) {
    view.innerHTML = `<div class="alert" role="alert">${esc(err.message)}</div>`;
  }
  view.focus();
}

function renderNotFound() {
  view.innerHTML = '<h1>Page not found</h1><p><a href="#/products">Back to products</a></p>';
}

function renderLogin() {
  if (state.token) return go('#/products');
  view.innerHTML = `
    <h1>Sign in</h1>
    <form class="stack card" data-testid="login-form" novalidate>
      <div class="alert" role="alert" data-testid="login-error" hidden></div>
      <label>Username <input name="username" autocomplete="username" required /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">Sign in</button>
      <p class="muted">Demo accounts: alice / alice123 (customer), admin / admin123 (admin).</p>
    </form>`;
  const form = view.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = view.querySelector('[data-testid="login-error"]');
    errorBox.hidden = true;
    const data = Object.fromEntries(new FormData(form));
    try {
      const session = await api('/login', { method: 'POST', body: data });
      state.setSession(session.token, session.user);
      const returnTo = sessionStorage.getItem('shop.returnTo');
      sessionStorage.removeItem('shop.returnTo');
      await refreshCartCount();
      go(returnTo && returnTo !== '#/login' ? returnTo : '#/products');
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  });
}

async function renderProducts() {
  view.innerHTML = `
    <h1>Products</h1>
    <div class="toolbar">
      <label>Search <input type="search" data-testid="product-search" placeholder="Name or category" /></label>
      <span class="muted" data-testid="product-count"></span>
    </div>
    <div class="grid" data-testid="product-list" aria-busy="true"></div>`;
  const list = view.querySelector('[data-testid="product-list"]');
  const search = view.querySelector('[data-testid="product-search"]');
  const counter = view.querySelector('[data-testid="product-count"]');
  const [products] = await Promise.all([api('/products'), refreshCartCount()]);

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const visible = products.filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q));
    counter.textContent = `${visible.length} product${visible.length === 1 ? '' : 's'}`;
    list.innerHTML = visible.length === 0 ? '<p data-testid="no-results">No products match your search.</p>' : visible.map((p) => `
      <article class="card product" data-testid="product-card" data-product-id="${esc(p.id)}" aria-label="${esc(p.name)}">
        <h2>${esc(p.name)}</h2>
        <p>${esc(p.description)}</p>
        <p class="muted">${esc(p.category)}</p>
        <p class="price" data-testid="product-price">${money(p.priceCents)}</p>
        ${p.stock > 0
          ? `<button type="button" data-action="add" data-id="${esc(p.id)}">Add to cart</button>`
          : '<button type="button" disabled>Out of stock</button>'}
      </article>`).join('');
    list.setAttribute('aria-busy', 'false');
  };
  search.addEventListener('input', draw);
  list.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="add"]');
    if (!button) return;
    button.disabled = true;
    try {
      const cart = await api('/cart', { method: 'POST', body: { productId: button.dataset.id, quantity: 1 } });
      setCartCount(cart.itemCount);
      toast('Added to cart');
    } catch (err) {
      toast(err.message);
    } finally {
      button.disabled = false;
    }
  });
  draw();
}

async function renderCart() {
  const cart = await api('/cart');
  setCartCount(cart.itemCount);
  if (cart.lines.length === 0) {
    view.innerHTML = '<h1>Your cart</h1><p data-testid="empty-cart">Your cart is empty.</p><a class="button" href="#/products">Browse products</a>';
    return;
  }
  view.innerHTML = `
    <h1>Your cart</h1>
    <table data-testid="cart-table">
      <thead><tr><th>Product</th><th class="num">Price</th><th class="num">Quantity</th><th class="num">Total</th><th></th></tr></thead>
      <tbody>
        ${cart.lines.map((l) => `
          <tr data-testid="cart-line" data-product-id="${esc(l.productId)}">
            <td>${esc(l.name)}</td>
            <td class="num">${money(l.priceCents)}</td>
            <td class="num"><input class="qty" type="number" min="0" value="${l.quantity}" aria-label="Quantity for ${esc(l.name)}" data-id="${esc(l.productId)}" /></td>
            <td class="num" data-testid="line-total">${money(l.lineTotalCents)}</td>
            <td><button type="button" class="secondary" data-action="remove" data-id="${esc(l.productId)}" aria-label="Remove ${esc(l.name)}">Remove</button></td>
          </tr>`).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div>Subtotal: <span data-testid="cart-subtotal">${money(cart.subtotalCents)}</span></div>
      <div>Shipping: <span data-testid="cart-shipping">${cart.shippingCents === 0 ? 'Free' : money(cart.shippingCents)}</span></div>
      <div class="grand">Total: <span data-testid="cart-total">${money(cart.totalCents)}</span></div>
      <div><a class="button" href="#/checkout">Proceed to checkout</a></div>
    </div>`;
  view.querySelector('tbody').addEventListener('change', async (event) => {
    const input = event.target.closest('input.qty');
    if (!input) return;
    await api(`/cart/${encodeURIComponent(input.dataset.id)}`, { method: 'PUT', body: { quantity: Number(input.value) } });
    await renderCart();
  });
  view.querySelector('tbody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="remove"]');
    if (!button) return;
    await api(`/cart/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    toast('Item removed');
    await renderCart();
  });
}

async function renderCheckout() {
  const cart = await api('/cart');
  if (cart.lines.length === 0) {
    view.innerHTML = '<h1>Checkout</h1><div class="alert" role="alert" data-testid="checkout-empty">Your cart is empty. Add a product before checking out.</div><a href="#/products">Browse products</a>';
    return;
  }
  view.innerHTML = `
    <h1>Checkout</h1>
    <p>Order total: <strong data-testid="checkout-total">${money(cart.totalCents)}</strong> (${cart.itemCount} item${cart.itemCount === 1 ? '' : 's'})</p>
    <form class="stack card" data-testid="checkout-form" novalidate>
      <div class="alert" role="alert" data-testid="checkout-error" hidden></div>
      <label>Full name <input name="fullName" autocomplete="name" /></label>
      <span class="field-error" data-error-for="fullName"></span>
      <label>Address <input name="address" autocomplete="street-address" /></label>
      <span class="field-error" data-error-for="address"></span>
      <label>Postal code <input name="postalCode" inputmode="numeric" autocomplete="postal-code" /></label>
      <span class="field-error" data-error-for="postalCode"></span>
      <label>Payment method
        <select name="paymentMethod">
          <option value="">Choose…</option>
          <option value="invoice">Invoice</option>
          <option value="cash-on-delivery">Cash on delivery</option>
        </select>
      </label>
      <span class="field-error" data-error-for="paymentMethod"></span>
      <button type="submit">Place order</button>
    </form>`;
  const form = view.querySelector('form');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = view.querySelector('[data-testid="checkout-error"]');
    errorBox.hidden = true;
    form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach((el) => { el.textContent = ''; });
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    try {
      const order = await api('/checkout', { method: 'POST', body: Object.fromEntries(new FormData(form)) });
      setCartCount(0);
      go(`#/order/${order.id}`);
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
      for (const [field, message] of Object.entries(err.fields || {})) {
        form.elements[field]?.setAttribute('aria-invalid', 'true');
        const slot = form.querySelector(`[data-error-for="${field}"]`);
        if (slot) slot.textContent = message;
      }
    } finally {
      submit.disabled = false;
    }
  });
}

async function renderOrder(id) {
  const order = await api(`/orders/${encodeURIComponent(id)}`);
  view.innerHTML = `
    <h1>Thank you for your order!</h1>
    <div class="card alert success" role="status" data-testid="order-confirmation">
      Order <strong data-testid="order-id">${esc(order.id)}</strong> is confirmed.
    </div>
    <p>Total charged: <strong data-testid="order-total">${money(order.totalCents)}</strong></p>
    <p>Shipping to ${esc(order.shipTo.fullName)}, ${esc(order.shipTo.address)} ${esc(order.shipTo.postalCode)}</p>
    <a href="#/products">Continue shopping</a>`;
}

async function renderOrders() {
  const orders = await api('/orders');
  view.innerHTML = `
    <h1>Your orders</h1>
    ${orders.length === 0 ? '<p data-testid="no-orders">You have not placed any orders yet.</p>' : `
    <table data-testid="orders-table">
      <thead><tr><th>Order</th><th>Date</th><th class="num">Items</th><th class="num">Total</th></tr></thead>
      <tbody>${orders.map((o) => `
        <tr data-testid="order-row"><td><a href="#/order/${esc(o.id)}">${esc(o.id)}</a></td><td>${esc(new Date(o.createdAt).toLocaleString())}</td>
        <td class="num">${o.lines.reduce((n, l) => n + l.quantity, 0)}</td><td class="num">${money(o.totalCents)}</td></tr>`).join('')}
      </tbody>
    </table>`}`;
}

async function renderAdmin() {
  if (state.user?.role !== 'admin') {
    view.innerHTML = '<h1>Admin</h1><div class="alert" role="alert" data-testid="access-denied">Access denied. Admins only.</div>';
    return;
  }
  const [products, orders] = await Promise.all([api('/products'), api('/admin/orders')]);
  view.innerHTML = `
    <h1>Admin</h1>
    <section class="card" aria-labelledby="new-product-heading">
      <h2 id="new-product-heading">Add product</h2>
      <form class="stack" data-testid="new-product-form" novalidate>
        <div class="alert" role="alert" data-testid="admin-error" hidden></div>
        <label>Name <input name="name" /></label>
        <label>Category <input name="category" value="Misc" /></label>
        <label>Price (USD) <input name="price" inputmode="decimal" /></label>
        <label>Stock <input name="stock" type="number" min="0" value="10" /></label>
        <button type="submit">Create product</button>
      </form>
    </section>
    <h2>Inventory</h2>
    <table data-testid="inventory-table">
      <thead><tr><th>Name</th><th>Category</th><th class="num">Price</th><th class="num">Stock</th><th></th></tr></thead>
      <tbody>${products.map((p) => `
        <tr data-testid="inventory-row" data-product-id="${esc(p.id)}">
          <td>${esc(p.name)}</td><td>${esc(p.category)}</td><td class="num">${money(p.priceCents)}</td>
          <td class="num" data-testid="inventory-stock">${p.stock}</td>
          <td><button type="button" class="danger" data-action="delete" data-id="${esc(p.id)}" aria-label="Delete ${esc(p.name)}">Delete</button></td>
        </tr>`).join('')}
      </tbody>
    </table>
    <h2>All orders (${orders.length})</h2>
    <table data-testid="admin-orders-table">
      <thead><tr><th>Order</th><th>Customer</th><th class="num">Total</th></tr></thead>
      <tbody>${orders.map((o) => `<tr data-testid="admin-order-row"><td>${esc(o.id)}</td><td>${esc(o.username)}</td><td class="num">${money(o.totalCents)}</td></tr>`).join('')}</tbody>
    </table>`;

  const form = view.querySelector('[data-testid="new-product-form"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form));
    const errorBox = view.querySelector('[data-testid="admin-error"]');
    try {
      const product = await api('/admin/products', {
        method: 'POST',
        body: { name: data.name, category: data.category, priceCents: Math.round(Number(data.price) * 100), stock: Number(data.stock) },
      });
      toast(`Created ${product.name}`);
      await renderAdmin();
    } catch (err) {
      errorBox.textContent = err.message;
      errorBox.hidden = false;
    }
  });
  view.querySelector('[data-testid="inventory-table"] tbody').addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action="delete"]');
    if (!button) return;
    await api(`/admin/products/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' });
    toast('Product deleted');
    await renderAdmin();
  });
}

// ------------------------------------------------------------------- boot --
document.querySelector('[data-testid="logout"]').addEventListener('click', async () => {
  try { await api('/logout', { method: 'POST' }); } catch { /* ignore */ }
  state.clear();
  setCartCount(0);
  go('#/login');
});

window.addEventListener('hashchange', render);
if (!location.hash) location.hash = '#/products';
else render();
