/* ============ MyKala storefront app ============ */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

/* Base path (e.g. /MyKala-store on GitHub Pages project sites) */
const BASE = (() => {
  const s = document.currentScript || document.querySelector('script[src*="store.js"]');
  if (!s?.src) return '';
  try {
    return new URL(s.src, location.href).pathname.replace(/\/js\/store\.js$/i, '') || '';
  } catch (_) {
    return '';
  }
})();

const withBase = (path = '/') => {
  if (!path || path === '#') return path;
  if (/^(https?:|data:|mailto:|tel:)/i.test(path)) return path;
  const p = path.startsWith('/') ? path : `/${path}`;
  return `${BASE}${p}` || '/';
};

const stripBase = (pathname) => {
  let p = pathname || '/';
  if (BASE && (p === BASE || p.startsWith(BASE + '/'))) p = p.slice(BASE.length) || '/';
  return p.replace(/\/+$/, '') || '/';
};

const state = {
  user: null,
  settings: { upi_id: '', upi_name: '', store_note: '' },
  staticMode: false,
  catalog: null,
};

const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/* ---------- static catalog (GitHub Pages / offline demo) ---------- */
async function loadCatalog() {
  if (state.catalog) return state.catalog;
  const res = await fetch(withBase('/data/catalog.json'));
  if (!res.ok) throw new Error('Could not load product catalog');
  state.catalog = await res.json();
  return state.catalog;
}

function filterProducts(products, params = '') {
  const q = new URLSearchParams(params.startsWith('?') ? params.slice(1) : params);
  let list = products.slice();
  if (q.get('featured') === '1') list = list.filter(p => p.featured);
  const cat = q.get('cat');
  if (cat && cat !== 'all') list = list.filter(p => p.category === cat);
  return list;
}

const DEMO_USER_KEY = 'mykala_demo_user';
const DEMO_ORDERS_KEY = 'mykala_demo_orders';

function getDemoUser() {
  try { return JSON.parse(localStorage.getItem(DEMO_USER_KEY) || 'null'); } catch (_) { return null; }
}
function setDemoUser(u) {
  if (u) localStorage.setItem(DEMO_USER_KEY, JSON.stringify(u));
  else localStorage.removeItem(DEMO_USER_KEY);
}
function getDemoOrders() {
  try { return JSON.parse(localStorage.getItem(DEMO_ORDERS_KEY) || '[]'); } catch (_) { return []; }
}
function saveDemoOrders(orders) {
  localStorage.setItem(DEMO_ORDERS_KEY, JSON.stringify(orders));
}

function makeOrderNo() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'MK';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function apiStatic(path, opts = {}) {
  const method = (opts.method || 'GET').toUpperCase();
  const catalog = await loadCatalog();
  const url = new URL(path, 'http://local');
  const p = url.pathname;

  if (p === '/api/settings' && method === 'GET') {
    return { ...catalog.settings };
  }

  if (p === '/api/products' && method === 'GET') {
    return { products: filterProducts(catalog.products, url.search) };
  }

  const prodMatch = p.match(/^\/api\/products\/(\d+)$/);
  if (prodMatch && method === 'GET') {
    const product = catalog.products.find(x => String(x.id) === prodMatch[1]);
    if (!product) throw new Error('Product not found');
    return { product };
  }

  if (p === '/api/auth/me' && method === 'GET') {
    return { user: getDemoUser() };
  }

  if (p === '/api/auth/login' && method === 'POST') {
    const body = opts.body || {};
    const user = getDemoUser();
    if (user && user.email?.toLowerCase() === String(body.email || '').toLowerCase()) {
      // accept same password as stored demo, or any non-empty for convenience in demo
      if (!body.password) throw new Error('Password required');
      return { user };
    }
    throw new Error('Invalid email or password. Create an account first (demo mode).');
  }

  if (p === '/api/auth/signup' && method === 'POST') {
    const body = opts.body || {};
    if (!body.name?.trim()) throw new Error('Name is required');
    if (!body.email?.trim()) throw new Error('Email is required');
    if (!body.password || body.password.length < 6) throw new Error('Password must be at least 6 characters');
    const user = {
      id: Date.now(),
      name: body.name.trim(),
      email: body.email.trim(),
      phone: (body.phone || '').trim(),
      is_admin: 0,
    };
    setDemoUser(user);
    return { user };
  }

  if (p === '/api/auth/logout' && method === 'POST') {
    // keep demo user registered so they can log back in; just clear session
    return { ok: true };
  }

  if (p === '/api/orders' && method === 'GET') {
    const user = getDemoUser();
    if (!user) throw new Error('Please log in');
    const orders = getDemoOrders().filter(o => o.email?.toLowerCase() === user.email.toLowerCase() || o._userId === user.id);
    return { orders };
  }

  if (p === '/api/orders' && method === 'POST') {
    const fd = opts.body;
    if (!(fd instanceof FormData)) throw new Error('Invalid order payload');
    const name = String(fd.get('customer_name') || '').trim();
    const phone = String(fd.get('phone') || '').trim();
    const address = String(fd.get('address') || '').trim();
    const city = String(fd.get('city') || '').trim();
    const stateName = String(fd.get('state') || '').trim();
    const pincode = String(fd.get('pincode') || '').trim();
    if (!name || !phone || !address || !city || !stateName || !pincode) {
      throw new Error('Please fill in all required delivery fields.');
    }
    if (!/^\d{10}$/.test(phone)) throw new Error('Phone must be 10 digits.');
    if (!/^\d{6}$/.test(pincode)) throw new Error('Pincode must be 6 digits.');
    if (!fd.get('screenshot')) throw new Error('Please upload your payment screenshot.');

    let cartItems = [];
    try { cartItems = JSON.parse(fd.get('items') || '[]'); } catch (_) { cartItems = []; }
    if (!cartItems.length) throw new Error('Your cart is empty.');

    const lines = [];
    let subtotal = 0;
    for (const it of cartItems) {
      const product = catalog.products.find(x => x.id === it.productId || String(x.id) === String(it.productId));
      if (!product) continue;
      const qty = Math.min(10, Math.max(1, Number(it.qty) || 1));
      lines.push({ productId: product.id, name: product.name, size: it.size, qty, price: product.price, image: product.image });
      subtotal += product.price * qty;
    }
    if (!lines.length) throw new Error('Your cart is empty.');
    const shipping = subtotal >= 999 ? 0 : 49;
    const total = subtotal + shipping;
    const order_no = makeOrderNo();
    const user = getDemoUser();
    const order = {
      order_no,
      _userId: user?.id,
      customer_name: name,
      email: String(fd.get('email') || user?.email || ''),
      phone,
      address,
      city,
      state: stateName,
      pincode,
      notes: String(fd.get('notes') || ''),
      payment_ref: String(fd.get('payment_ref') || ''),
      items: lines,
      subtotal,
      shipping,
      total,
      status: 'pending',
      created_at: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
    };
    const orders = getDemoOrders();
    orders.unshift(order);
    saveDemoOrders(orders);
    return { order_no };
  }

  if (p === '/api/orders/track' && method === 'POST') {
    const body = opts.body || {};
    const order_no = String(body.order_no || '').trim().toUpperCase();
    const phone = String(body.phone || '').trim();
    const order = getDemoOrders().find(o => o.order_no === order_no && o.phone === phone);
    if (!order) throw new Error('No order found with that number and phone.');
    return { order };
  }

  throw new Error('This action needs the full MyKala server. Browse and cart work in the static demo.');
}

async function api(path, opts = {}) {
  if (state.staticMode) return apiStatic(path, opts);

  const fetchOpts = {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  };

  let res;
  try {
    res = await fetch(path, fetchOpts);
  } catch (_) {
    state.staticMode = true;
    return apiStatic(path, opts);
  }

  // HTML response or missing API → static demo mode (GitHub Pages)
  const ct = res.headers.get('content-type') || '';
  if (res.status === 404 || ct.includes('text/html')) {
    state.staticMode = true;
    return apiStatic(path, opts);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- cart (localStorage) ---------- */
const CART_KEY = 'mykala_cart';
const getCart = () => JSON.parse(localStorage.getItem(CART_KEY) || '[]');
const saveCart = c => { localStorage.setItem(CART_KEY, JSON.stringify(c)); updateCartCount(); };
const cartCount = () => getCart().reduce((a, i) => a + i.qty, 0);
function updateCartCount() { const el = $('#cartCount'); if (el) el.textContent = cartCount(); }
function addToCart(productId, size, qty) {
  const cart = getCart();
  const found = cart.find(i => i.productId === productId && i.size === size);
  if (found) found.qty = Math.min(10, found.qty + qty);
  else cart.push({ productId, size, qty });
  saveCart(cart);
  toast('Added to cart 🛍️');
}

/* ---------- router ---------- */
const routes = {
  '/': viewHome, '/shop': viewShop, '/product': viewProduct, '/cart': viewCart,
  '/checkout': viewCheckout, '/login': viewLogin, '/signup': viewSignup,
  '/account': viewAccount, '/track': viewTrack, '/order-success': viewSuccess,
};

function navigate(href, { replace = false } = {}) {
  const url = href.startsWith('http') ? href : withBase(href.startsWith('/') ? href : `/${href}`);
  if (replace) history.replaceState({}, '', url);
  else history.pushState({}, '', url);
  render();
}

async function render() {
  const url = new URL(location.pathname + location.search, location.origin);
  const path = stripBase(url.pathname);
  const routeKey = path.split('/').slice(0, 2).join('/') || '/';
  const view = routes[routeKey] || routes['/'];
  $$('.main-nav a').forEach(a => {
    const href = stripBase(new URL(a.getAttribute('href'), location.origin).pathname);
    a.classList.toggle('active', href === path);
  });
  $('#mainNav')?.classList.remove('open');
  try {
    // Pass a URL whose pathname is base-stripped so views can read /product/:id etc.
    const viewUrl = new URL(url.href);
    // Fake pathname for views
    Object.defineProperty(viewUrl, 'pathname', { value: path, configurable: true });
    await view(viewUrl);
  } catch (e) {
    $('#view').innerHTML = `<div class="empty-state container"><h2>Page not found</h2><p>${esc(e.message)}</p><a href="${withBase('/')}" class="btn btn-dark" data-link>Back home</a></div>`;
  }
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  let href = a.getAttribute('href') || '/';
  // Normalize app-relative paths to include the GitHub Pages base when needed
  if (href.startsWith('/') && BASE && !href.startsWith(BASE + '/') && href !== BASE) {
    href = withBase(href);
  } else if (!/^(https?:|\/\/|#|mailto:|tel:)/i.test(href) && !href.startsWith(BASE)) {
    // bare "shop" / "./" style links
    href = withBase('/' + href.replace(/^\.\//, ''));
  }
  history.pushState({}, '', href);
  render();
});
window.addEventListener('popstate', render);

$('#menuBtn')?.addEventListener('click', () => $('#mainNav').classList.toggle('open'));

/* ---------- shared ---------- */
function asset(path) {
  return withBase(path);
}

function productCard(p) {
  const soldOut = p.stock <= 0;
  return `
  <a href="${withBase('/product/' + p.id)}" data-link class="product-card">
    ${p.featured ? '<span class="badge new">Featured</span>' : '<span class="badge under">Under ₹1000</span>'}
    <div class="img-wrap"><img src="${esc(asset(p.image))}" alt="${esc(p.name)}" loading="lazy"></div>
    <h3>${esc(p.name)}</h3>
    <div class="cat">${esc(p.category)}'s</div>
    <div class="price">${inr(p.price)}</div>
    ${soldOut ? '<div class="stock-note out" style="margin-top:4px">Sold out</div>' : (p.stock <= 5 ? '<div class="stock-note low" style="margin-top:4px">Only a few left</div>' : '')}
  </a>`;
}

async function loadProducts(params = '') {
  const { products } = await api('/api/products' + params);
  return products;
}

/* ---------- views ---------- */
async function viewHome() {
  const [featured, all] = await Promise.all([loadProducts('?featured=1'), loadProducts()]);
  const menImg = asset(all.find(p => p.category === 'men')?.image || '/images/products/hoodie-olive.jpg');
  const womenImg = asset(all.find(p => p.category === 'women')?.image || '/images/products/dress-terracotta.jpg');
  $('#view').innerHTML = `
  ${state.staticMode ? `<div class="announce" style="background:#2E5E4E;color:#fff">Static demo on GitHub Pages — browse & cart work offline. Full checkout/API needs the Node server.</div>` : ''}
  <section class="hero">
    <div class="hero-inner">
      <div>
        <span class="eyebrow">New season · Everything under ₹1000</span>
        <h1>Clothes that feel like <em>nothing at all.</em></h1>
        <p class="lead">Absurdly soft organic cotton, honest prices, zero nonsense. Made for every day — and everyone.</p>
        <div class="hero-ctas">
          <a href="${withBase('/shop')}" data-link class="btn btn-dark">Shop the collection</a>
          <a href="${withBase('/shop?cat=women')}" data-link class="btn btn-outline">New for women</a>
        </div>
      </div>
      <div class="hero-figure"><img src="${esc(asset('/images/hero.jpg'))}" alt="MyKala collection"></div>
    </div>
  </section>

  <div class="values">
    <div class="values-inner">
      <div class="value"><div class="value-icon">🌱</div><div><b>Organic cotton</b><span>Sustainably sourced</span></div></div>
      <div class="value"><div class="value-icon">🚚</div><div><b>Free shipping</b><span>On orders over ₹999</span></div></div>
      <div class="value"><div class="value-icon">↩️</div><div><b>15-day returns</b><span>No questions asked</span></div></div>
      <div class="value"><div class="value-icon">🔒</div><div><b>Verified UPI payments</b><span>Every order checked</span></div></div>
    </div>
  </div>

  <section class="section container">
    <div class="section-head">
      <div><h2>Fan favourites</h2><p>The pieces people keep coming back for.</p></div>
      <a href="${withBase('/shop')}" data-link>Shop all →</a>
    </div>
    <div class="grid">${featured.slice(0, 4).map(productCard).join('')}</div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="tiles">
        <a class="tile" href="${withBase('/shop?cat=men')}" data-link><img src="${esc(menImg)}" alt="Men"><div class="tile-label"><h3>For him</h3><span>Tees, hoodies, joggers & more</span></div></a>
        <a class="tile" href="${withBase('/shop?cat=women')}" data-link><img src="${esc(womenImg)}" alt="Women"><div class="tile-label"><h3>For her</h3><span>Dresses, knits & everyday softness</span></div></a>
      </div>
    </div>
  </section>

  <section class="section container">
    <div class="story">
      <div>
        <span class="eyebrow">Our promise</span>
        <h2>Good clothes shouldn't cost a fortune.</h2>
        <p>We started MyKala with one rule: every single thing we sell stays under ₹1000. No inflated MRPs, no fake discounts — just well-made essentials at prices that make sense.</p>
        <p>Pay instantly with UPI, upload your payment screenshot, and we verify every transaction by hand before your order ships.</p>
        <div class="story-stats">
          <div><b>₹999</b><span>our price ceiling</span></div>
          <div><b>100%</b><span>payments verified</span></div>
          <div><b>15 days</b><span>easy returns</span></div>
        </div>
      </div>
      <div class="hero-figure"><img src="${esc(asset('/images/products/sweater-cream.jpg'))}" alt="MyKala knitwear"></div>
    </div>
  </section>`;
}

async function viewShop(url) {
  const cat = url.searchParams.get('cat') || 'all';
  const [products] = await Promise.all([loadProducts()]);
  const view = $('#view');
  view.innerHTML = `
  <section class="section container">
    <div class="section-head"><div><h2>Shop ${cat === 'all' ? 'everything' : 'for ' + cat}</h2><p>Every piece under ₹1000. Always.</p></div></div>
    <div class="toolbar">
      <div class="chips">
        ${['all', 'men', 'women', 'unisex'].map(c => `<button class="chip ${c === cat ? 'active' : ''}" data-cat="${c}">${c === 'all' ? 'All' : c === 'unisex' ? 'Unisex' : c + "'s"}</button>`).join('')}
      </div>
      <div class="search-box">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <input id="shopSearch" placeholder="Search products…" value="${esc(url.searchParams.get('q') || '')}">
      </div>
    </div>
    <div class="grid" id="shopGrid"></div>
  </section>`;

  let activeCat = cat;
  const filter = () => {
    const q = $('#shopSearch').value.trim().toLowerCase();
    const list = products.filter(p => (activeCat === 'all' || p.category === activeCat) && (!q || (p.name + ' ' + p.description).toLowerCase().includes(q)));
    $('#shopGrid').innerHTML = list.length ? list.map(productCard).join('')
      : '<div class="empty-state" style="grid-column:1/-1"><div class="big">🔍</div><h2>Nothing found</h2><p>Try a different search or category.</p></div>';
  };
  $$('.chip', view).forEach(ch => ch.addEventListener('click', () => {
    activeCat = ch.dataset.cat;
    history.replaceState({}, '', withBase('/shop?cat=' + activeCat));
    $$('.chip', view).forEach(c => c.classList.toggle('active', c === ch));
    filter();
  }));
  $('#shopSearch').addEventListener('input', filter);
  filter();
}

async function viewProduct(url) {
  const id = url.pathname.split('/')[2];
  const { product: p } = await api('/api/products/' + id);
  let selSize = null, qty = 1;
  const related = (await loadProducts()).filter(x => x.category === p.category && x.id !== p.id).slice(0, 4);

  $('#view').innerHTML = `
  <section class="section container">
    <p style="margin-bottom:18px;font-size:0.85rem"><a href="${withBase('/shop')}" data-link>Shop</a> / <a href="${withBase('/shop?cat=' + p.category)}" data-link>${esc(p.category)}'s</a> / <span style="color:var(--ink-faint)">${esc(p.name)}</span></p>
    <div class="pdp">
      <div class="pdp-img"><img src="${esc(asset(p.image))}" alt="${esc(p.name)}"></div>
      <div>
        <span class="pill-tag">MyKala Essentials</span>
        <h1>${esc(p.name)}</h1>
        <div class="price">${inr(p.price)} <span class="mrp">incl. taxes</span></div>
        <div class="tax-note">MRP ${inr(p.price + 300)} · You save ${inr(300)} (${Math.round(300 / (p.price + 300) * 100)}% off)</div>
        <p class="desc">${esc(p.description)}</p>
        <div class="option-label">Select size <span id="sizeHint">Please pick a size</span></div>
        <div class="sizes" id="sizes">${p.sizes.map(s => `<button class="size-btn" data-size="${esc(s)}">${esc(s)}</button>`).join('')}</div>
        <div class="qty-row">
          <div class="qty"><button id="minus">−</button><span id="qtyVal">1</span><button id="plus">+</button></div>
          <span class="stock-note ${p.stock <= 0 ? 'out' : p.stock <= 5 ? 'low' : 'ok'}">${p.stock <= 0 ? 'Sold out' : p.stock <= 5 ? `Only ${p.stock} left!` : 'In stock, ready to ship'}</span>
        </div>
        <div class="pdp-ctas">
          <button class="btn btn-dark btn-block" id="addBtn" ${p.stock <= 0 ? 'disabled' : ''}>Add to cart — ${inr(p.price)}</button>
        </div>
        <div class="info-box"><b>🚚 Shipping</b>Free on orders over ₹999, otherwise flat ₹49. Dispatched in 1–2 days after payment verification.</div>
        <div class="info-box"><b>🔒 Pay with UPI</b>Pay via GPay / PhonePe / Paytm at checkout and upload your payment screenshot — we verify every payment manually.</div>
        <div class="info-box"><b>↩️ Returns</b>Not feeling it? Return within 15 days for a full refund.</div>
      </div>
    </div>
  </section>
  ${related.length ? `
  <section class="section alt"><div class="container">
    <div class="section-head"><div><h2>Pairs well with</h2><p>More ${esc(p.category)}'s essentials.</p></div><a href="${withBase('/shop?cat=' + p.category)}" data-link>View all →</a></div>
    <div class="grid">${related.map(productCard).join('')}</div>
  </div></section>` : ''}`;

  $$('#sizes .size-btn').forEach(b => b.addEventListener('click', () => {
    $$('#sizes .size-btn').forEach(x => x.classList.remove('selected'));
    b.classList.add('selected');
    selSize = b.dataset.size;
    $('#sizeHint').textContent = 'Size ' + selSize;
  }));
  $('#minus').onclick = () => { qty = Math.max(1, qty - 1); $('#qtyVal').textContent = qty; };
  $('#plus').onclick = () => { qty = Math.min(10, qty + 1); $('#qtyVal').textContent = qty; };
  $('#addBtn').onclick = () => {
    if (!selSize) return toast('Please select a size first');
    addToCart(p.id, selSize, qty);
  };
}

async function cartDetails() {
  const cart = getCart();
  const items = [];
  for (const it of cart) {
    try {
      const { product: p } = await api('/api/products/' + it.productId);
      items.push({ ...it, name: p.name, price: p.price, image: p.image });
    } catch (_) { /* product removed */ }
  }
  const subtotal = items.reduce((a, i) => a + i.price * i.qty, 0);
  return { items, subtotal, shipping: subtotal === 0 || subtotal >= 999 ? 0 : 49, total: subtotal + (subtotal === 0 || subtotal >= 999 ? 0 : 49) };
}

async function viewCart() {
  const { items, subtotal, shipping, total } = await cartDetails();

  if (!items.length) {
    $('#view').innerHTML = `<div class="empty-state container"><div class="big">🛍️</div><h2>Your cart is empty</h2><p>Fill it with something soft.</p><a href="${withBase('/shop')}" data-link class="btn btn-dark">Start shopping</a></div>`;
    return;
  }

  const remaining = Math.max(0, 999 - subtotal);
  $('#view').innerHTML = `
  <section class="section container">
    <div class="section-head"><div><h2>Your cart</h2><p>${items.length} item${items.length > 1 ? 's' : ''} · everything under ₹1000</p></div></div>
    <div class="cart-layout">
      <div id="cartItems">
        ${items.map((i, idx) => `
        <div class="cart-item">
          <a href="${withBase('/product/' + i.productId)}" data-link><img src="${esc(asset(i.image))}" alt=""></a>
          <div>
            <h3>${esc(i.name)}</h3>
            <div class="meta">Size ${esc(i.size)} · ${inr(i.price)} each</div>
            <div class="qty" style="display:inline-flex">
              <button data-dec="${idx}">−</button><span>${i.qty}</span><button data-inc="${idx}">+</button>
            </div>
            <br><button class="remove" data-rm="${idx}">Remove</button>
          </div>
          <div class="line-price">${inr(i.price * i.qty)}</div>
        </div>`).join('')}
      </div>
      <div class="summary">
        <h3>Order summary</h3>
        <div class="free-ship-progress">
          <div class="bar"><i style="width:${Math.min(100, subtotal / 999 * 100)}%"></i></div>
          <p>${remaining > 0 ? `Add ${inr(remaining)} more for <b>free shipping</b>` : '🎉 You unlocked free shipping!'}</p>
        </div>
        <div class="sum-row"><span>Subtotal</span><span>${inr(subtotal)}</span></div>
        <div class="sum-row"><span>Shipping</span><span>${shipping === 0 ? 'FREE' : inr(shipping)}</span></div>
        <div class="sum-row total"><span>Total</span><span>${inr(total)}</span></div>
        <br>
        <a href="${withBase('/checkout')}" data-link class="btn btn-green btn-block">Checkout · ${inr(total)}</a>
        <br><a href="${withBase('/shop')}" data-link style="display:block;text-align:center;margin-top:14px;font-weight:700;font-size:0.9rem">Continue shopping</a>
      </div>
    </div>
  </section>`;

  $('#cartItems').addEventListener('click', e => {
    const inc = e.target.dataset.inc, dec = e.target.dataset.dec, rm = e.target.dataset.rm;
    const cart = getCart();
    if (inc !== undefined) cart[inc].qty = Math.min(10, cart[inc].qty + 1);
    if (dec !== undefined) cart[dec].qty = Math.max(1, cart[dec].qty - 1);
    if (rm !== undefined) cart.splice(rm, 1);
    saveCart(cart);
    viewCart();
  });
}

async function viewCheckout() {
  const { items, subtotal, shipping, total } = await cartDetails();
  if (!items.length) { navigate('/cart'); return; }

  let screenshotFile = null;
  $('#view').innerHTML = `
  <section class="section container">
    <div class="section-head"><div><h2>Checkout</h2><p>Pay via UPI, upload your screenshot, done.${state.staticMode ? ' <em>(Demo — orders stay in this browser.)</em>' : ''}</p></div></div>
    <div class="checkout-layout">
      <div>
        <div class="panel">
          <h2><span class="step-num">1</span> Delivery details</h2>
          <div class="form-error" id="ckErr" style="display:none"></div>
          <div class="field"><label>Full name *</label><input id="fName" value="${esc(state.user?.name || '')}" placeholder="Your name"></div>
          <div class="field-row">
            <div class="field"><label>Phone (10 digits) *</label><input id="fPhone" value="${esc(state.user?.phone || '')}" placeholder="9876543210" maxlength="10" inputmode="numeric"></div>
            <div class="field"><label>Email (for order updates)</label><input id="fEmail" value="${esc(state.user?.email || '')}" placeholder="you@email.com"></div>
          </div>
          <div class="field"><label>Address *</label><textarea id="fAddr" placeholder="House / street / landmark"></textarea></div>
          <div class="field-row">
            <div class="field"><label>City *</label><input id="fCity" placeholder="City"></div>
            <div class="field"><label>State *</label><input id="fState" placeholder="State"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Pincode *</label><input id="fPin" placeholder="6-digit pincode" maxlength="6" inputmode="numeric"></div>
            <div class="field"><label>Order notes (optional)</label><input id="fNotes" placeholder="Any delivery instructions"></div>
          </div>
        </div>

        <div class="panel">
          <h2><span class="step-num">2</span> Pay via UPI</h2>
          <div class="upi-box">
            <b style="color:var(--green-dark)">Send ${inr(total)} to this UPI ID:</b>
            <div class="upi-id"><b id="upiId">${esc(state.settings.upi_id)}</b><button class="copy-btn" id="copyUpi">Copy</button></div>
            <p style="font-size:0.82rem;color:var(--ink-soft);margin-top:10px">${esc(state.settings.store_note)}</p>
          </div>
          <div class="field"><label>UPI transaction / reference number (optional)</label><input id="fRef" placeholder="e.g. 4312 0987"></div>
          <div class="field">
            <label>Payment screenshot *</label>
            <div class="upload-zone" id="dropZone">
              <div class="up-icon">📸</div>
              <b>Upload payment screenshot</b>
              <span>Tap to choose a JPG / PNG (proof of your UPI payment)</span>
            </div>
            <input type="file" id="fShot" accept="image/jpeg,image/png,image/webp" style="display:none">
            <div class="upload-preview" id="shotPreview" style="display:none">
              <img id="shotImg" alt="Payment screenshot">
              <button class="clear-up" id="clearShot" type="button">✕</button>
            </div>
          </div>
        </div>
      </div>

      <div class="summary">
        <h3>Your order</h3>
        ${items.map(i => `
          <div class="mini-cart-item">
            <img src="${esc(asset(i.image))}" alt="">
            <div><b>${esc(i.name)}</b><span>Size ${esc(i.size)} · Qty ${i.qty}</span></div>
            <div style="margin-left:auto;font-weight:800;font-size:0.9rem">${inr(i.price * i.qty)}</div>
          </div>`).join('')}
        <div class="sum-row" style="margin-top:12px"><span>Subtotal</span><span>${inr(subtotal)}</span></div>
        <div class="sum-row"><span>Shipping</span><span>${shipping === 0 ? 'FREE' : inr(shipping)}</span></div>
        <div class="sum-row total"><span>Total</span><span>${inr(total)}</span></div>
        <br>
        <button class="btn btn-terra btn-block" id="placeBtn">Place order · ${inr(total)}</button>
        <p style="font-size:0.75rem;color:var(--ink-faint);margin-top:12px;text-align:center">We verify your payment screenshot and confirm within a few hours.</p>
      </div>
    </div>
  </section>`;

  const dz = $('#dropZone');
  dz.onclick = () => $('#fShot').click();
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('drag'); };
  dz.ondragleave = () => dz.classList.remove('drag');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('drag'); setShot(e.dataTransfer.files[0]); };
  $('#fShot').onchange = e => setShot(e.target.files[0]);
  function setShot(f) {
    if (!f) return;
    if (!/^image\/(jpeg|jpg|png|webp)$/.test(f.type)) return toast('Please choose a JPG, PNG or WEBP image');
    screenshotFile = f;
    $('#shotImg').src = URL.createObjectURL(f);
    $('#shotPreview').style.display = 'inline-block';
    dz.style.display = 'none';
  }
  $('#clearShot').onclick = () => { screenshotFile = null; $('#shotPreview').style.display = 'none'; dz.style.display = 'block'; $('#fShot').value = ''; };
  $('#copyUpi').onclick = () => {
    navigator.clipboard?.writeText(state.settings.upi_id).then(() => toast('UPI ID copied!')).catch(() => toast(state.settings.upi_id));
  };

  $('#placeBtn').onclick = async () => {
    const err = $('#ckErr');
    const showErr = m => { err.textContent = m; err.style.display = 'block'; err.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    err.style.display = 'none';
    const btn = $('#placeBtn');
    const fd = new FormData();
    fd.append('customer_name', $('#fName').value);
    fd.append('phone', $('#fPhone').value);
    fd.append('email', $('#fEmail').value);
    fd.append('address', $('#fAddr').value);
    fd.append('city', $('#fCity').value);
    fd.append('state', $('#fState').value);
    fd.append('pincode', $('#fPin').value);
    fd.append('notes', $('#fNotes').value);
    fd.append('payment_ref', $('#fRef').value);
    fd.append('items', JSON.stringify(getCart()));
    if (!screenshotFile) return showErr('Please upload your payment screenshot so we can verify your UPI payment.');
    fd.append('screenshot', screenshotFile);
    btn.disabled = true; btn.textContent = 'Placing order…';
    try {
      const { order_no } = await api('/api/orders', { method: 'POST', body: fd });
      saveCart([]);
      navigate('/order-success?no=' + order_no);
    } catch (e) {
      showErr(e.message);
      btn.disabled = false; btn.textContent = `Place order · ${inr(total)}`;
    }
  };
}

function viewSuccess(url) {
  const no = url.searchParams.get('no') || '';
  $('#view').innerHTML = `
  <div class="success-wrap">
    <div class="success-icon">
      <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
    </div>
    <span class="eyebrow">Order placed</span>
    <h1 style="font-size:2.1rem;letter-spacing:-0.02em">Thank you! 🎉</h1>
    <p style="color:var(--ink-soft)">We received your order and payment screenshot. We'll verify your payment and confirm shortly.${state.staticMode ? ' <em>(Saved in this browser only — static demo.)</em>' : ''}</p>
    <div class="order-no-chip">${esc(no)}</div>
    <p style="font-size:0.85rem;color:var(--ink-faint)">Save this order number — you can track your order with it anytime.</p>
    <div style="display:flex;gap:14px;justify-content:center;margin-top:28px;flex-wrap:wrap">
      <a href="${withBase('/track')}" data-link class="btn btn-dark">Track order</a>
      <a href="${withBase('/shop')}" data-link class="btn btn-outline">Keep shopping</a>
    </div>
  </div>`;
}

function authForm(mode) {
  const isLogin = mode === 'login';
  $('#view').innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>${isLogin ? 'Welcome back' : 'Join MyKala'}</h1>
      <p class="sub">${isLogin ? 'Log in to track orders and check out faster.' : 'Create an account to track orders and check out faster.'}${state.staticMode ? ' <em>(Demo accounts stay in this browser.)</em>' : ''}</p>
      <div class="form-error" id="authErr" style="display:none"></div>
      ${isLogin ? '' : `
      <div class="field"><label>Full name</label><input id="aName" placeholder="Your name"></div>
      <div class="field"><label>Phone</label><input id="aPhone" placeholder="9876543210" maxlength="10" inputmode="numeric"></div>`}
      <div class="field"><label>Email</label><input id="aEmail" type="email" placeholder="you@email.com"></div>
      <div class="field"><label>Password</label><input id="aPass" type="password" placeholder="${isLogin ? 'Your password' : 'At least 6 characters'}"></div>
      <button class="btn btn-dark btn-block" id="authBtn">${isLogin ? 'Log in' : 'Create account'}</button>
      <p class="auth-alt">${isLogin ? `New here? <a href="${withBase('/signup')}" data-link>Create an account</a>` : `Already have an account? <a href="${withBase('/login')}" data-link>Log in</a>`}</p>
      ${isLogin ? `<p class="auth-alt" style="font-size:0.8rem;color:var(--ink-faint)">Store owner? <a href="${withBase('/admin.html')}">Admin login →</a></p>` : ''}
    </div>
  </div>`;
  $('#authBtn').onclick = async () => {
    const err = $('#authErr');
    err.style.display = 'none';
    const btn = $('#authBtn');
    btn.disabled = true;
    try {
      const body = isLogin
        ? { email: $('#aEmail').value, password: $('#aPass').value }
        : { name: $('#aName').value, phone: $('#aPhone').value, email: $('#aEmail').value, password: $('#aPass').value };
      const { user } = await api(isLogin ? '/api/auth/login' : '/api/auth/signup', { method: 'POST', body });
      state.user = user;
      if (state.staticMode && isLogin) {
        // session only
      }
      toast(isLogin ? `Welcome back, ${user.name.split(' ')[0]}!` : `Welcome to MyKala, ${user.name.split(' ')[0]}!`);
      navigate('/account');
    } catch (e) {
      err.textContent = e.message; err.style.display = 'block';
      btn.disabled = false;
    }
  };
}
const viewLogin = () => authForm('login');
const viewSignup = () => authForm('signup');

function orderCardHtml(o) {
  return `
  <div class="order-card">
    <div class="oc-head">
      <div><b>${esc(o.order_no)}</b><div class="oc-date">${new Date((o.created_at || '') + ((o.created_at || '').includes('T') ? '' : 'Z')).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
      <span class="status-badge status-${esc(o.status)}">${esc(o.status)}</span>
    </div>
    <ul class="order-lines">
      ${(o.items || []).map(i => `<li><span>${esc(i.name)} · ${esc(i.size)} × ${i.qty}</span><span>${inr(i.price * i.qty)}</span></li>`).join('')}
    </ul>
    <div class="order-total-row"><span>Total paid</span><span>${inr(o.total)}</span></div>
  </div>`;
}

async function viewAccount() {
  if (!state.user) { navigate('/login'); return; }
  const { orders } = await api('/api/orders');
  $('#view').innerHTML = `
  <section class="section container">
    <div class="account-head">
      <div class="avatar">${esc(state.user.name[0]?.toUpperCase() || 'M')}</div>
      <div><h1>Hi, ${esc(state.user.name.split(' ')[0])}</h1><p>${esc(state.user.email)}${state.user.phone ? ' · ' + esc(state.user.phone) : ''}</p></div>
      <button class="btn btn-outline btn-sm" id="logoutBtn" style="margin-left:auto">Log out</button>
    </div>
    <div class="section-head"><div><h2>My orders</h2><p>${orders.length} order${orders.length !== 1 ? 's' : ''} so far</p></div></div>
    ${orders.length ? orders.map(orderCardHtml).join('') : `<div class="empty-state"><div class="big">📦</div><h2>No orders yet</h2><p>Your orders will appear here.</p><a href="${withBase('/shop')}" data-link class="btn btn-dark">Start shopping</a></div>`}
  </section>`;
  $('#logoutBtn').onclick = async () => {
    try { await api('/api/auth/logout', { method: 'POST' }); } catch (_) {}
    state.user = null;
    toast('Logged out. See you soon!');
    navigate('/');
  };
}

async function viewTrack() {
  $('#view').innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>Track your order</h1>
      <p class="sub">Enter your order number and phone number.</p>
      <div class="form-error" id="trErr" style="display:none"></div>
      <div class="field"><label>Order number</label><input id="tNo" placeholder="e.g. MK7XQ2A1B2"></div>
      <div class="field"><label>Phone number</label><input id="tPhone" placeholder="9876543210" maxlength="10" inputmode="numeric"></div>
      <button class="btn btn-dark btn-block" id="trBtn">Find my order</button>
    </div>
    <div id="trResult"></div>
  </div>`;
  $('#trBtn').onclick = async () => {
    $('#trErr').style.display = 'none';
    $('#trResult').innerHTML = '';
    try {
      const { order } = await api('/api/orders/track', { method: 'POST', body: { order_no: $('#tNo').value, phone: $('#tPhone').value } });
      $('#trResult').innerHTML = `<div style="margin-top:22px">${orderCardHtml(order)}</div>`;
    } catch (e) {
      const el = $('#trErr'); el.textContent = e.message; el.style.display = 'block';
    }
  };
}

/* ---------- rewrite static header/footer links for base path ---------- */
function applyBaseToShell() {
  if (!BASE) return;
  document.querySelectorAll('a[href^="/"]').forEach(a => {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('//') || href.startsWith(BASE)) return;
    a.setAttribute('href', withBase(href));
  });
  document.querySelectorAll('link[href^="/"], script[src^="/"], img[src^="/"]').forEach(el => {
    const attr = el.hasAttribute('href') ? 'href' : 'src';
    const v = el.getAttribute(attr);
    if (!v || v.startsWith('//') || v.startsWith(BASE)) return;
    el.setAttribute(attr, withBase(v));
  });
}

/* ---------- boot ---------- */
(async function boot() {
  applyBaseToShell();
  updateCartCount();
  try {
    const [me, settings] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user;
    state.settings = settings;
  } catch (_) {
    // Ensure catalog settings load in pure static mode
    try {
      const catalog = await loadCatalog();
      state.staticMode = true;
      state.settings = catalog.settings;
      state.user = getDemoUser();
    } catch (e) {
      console.warn(e);
    }
  }
  render();
})();
