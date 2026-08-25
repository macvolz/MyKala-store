/* ============ MyKala storefront app ============ */
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

const state = { user: null, settings: { upi_id: '', upi_name: '', store_note: '' } };

const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(path, opts = {}) {
  const res = await fetch(path, { headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}, ...opts,
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body });
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

async function render() {
  const url = new URL(location.pathname + location.search, location.origin);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const view = routes[path.split('/').slice(0, 2).join('/')] || routes['/'];
  $$('.main-nav a').forEach(a => a.classList.toggle('active', a.getAttribute('href') === path));
  $('#mainNav').classList.remove('open');
  try { await view(url); } catch (e) {
    $('#view').innerHTML = `<div class="empty-state container"><h2>Page not found</h2><p>${esc(e.message)}</p><a href="/" class="btn btn-dark" data-link>Back home</a></div>`;
  }
  window.scrollTo({ top: 0 });
}

document.addEventListener('click', e => {
  const a = e.target.closest('a[data-link]');
  if (!a) return;
  e.preventDefault();
  history.pushState({}, '', a.getAttribute('href'));
  render();
});
window.addEventListener('popstate', render);

$('#menuBtn').addEventListener('click', () => $('#mainNav').classList.toggle('open'));

/* ---------- shared ---------- */
function productCard(p) {
  const soldOut = p.stock <= 0;
  return `
  <a href="/product/${p.id}" data-link class="product-card">
    ${p.featured ? '<span class="badge new">Featured</span>' : '<span class="badge under">Under ₹1000</span>'}
    <div class="img-wrap"><img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy"></div>
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
  const menImg = all.find(p => p.category === 'men')?.image || '/images/hoodie-olive.jpg';
  const womenImg = all.find(p => p.category === 'women')?.image || '/images/dress-terracotta.jpg';
  $('#view').innerHTML = `
  <section class="hero">
    <div class="hero-inner">
      <div>
        <span class="eyebrow">New season · Everything under ₹1000</span>
        <h1>Clothes that feel like <em>nothing at all.</em></h1>
        <p class="lead">Absurdly soft organic cotton, honest prices, zero nonsense. Made for every day — and everyone.</p>
        <div class="hero-ctas">
          <a href="/shop" data-link class="btn btn-dark">Shop the collection</a>
          <a href="/shop?cat=women" data-link class="btn btn-outline">New for women</a>
        </div>
      </div>
      <div class="hero-figure"><img src="/images/hero.jpg" alt="MyKala collection"></div>
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
      <a href="/shop" data-link>Shop all →</a>
    </div>
    <div class="grid">${featured.slice(0, 4).map(productCard).join('')}</div>
  </section>

  <section class="section alt">
    <div class="container">
      <div class="tiles">
        <a class="tile" href="/shop?cat=men" data-link><img src="${esc(menImg)}" alt="Men"><div class="tile-label"><h3>For him</h3><span>Tees, hoodies, joggers & more</span></div></a>
        <a class="tile" href="/shop?cat=women" data-link><img src="${esc(womenImg)}" alt="Women"><div class="tile-label"><h3>For her</h3><span>Dresses, knits & everyday softness</span></div></a>
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
      <div class="hero-figure"><img src="/images/products/sweater-cream.jpg" alt="MyKala knitwear"></div>
    </div>
  </section>`;
}

async function viewShop(url) {
  const cat = url.searchParams.get('cat') || 'all';
  const [products] = await Promise.all([loadProducts()]);
  const view = $('#view');
  view.innerHTML = `
  <section class="section container">
    <div class="section-head"><div><h2>Shop ${cat === 'all' ? 'everything' : "for " + cat}</h2><p>Every piece under ₹1000. Always.</p></div></div>
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

  const cats = { all: () => true };
  const filter = () => {
    const q = $('#shopSearch').value.trim().toLowerCase();
    const list = products.filter(p => (cat === 'all' || p.category === cat) && (!q || (p.name + ' ' + p.description).toLowerCase().includes(q)));
    $('#shopGrid').innerHTML = list.length ? list.map(productCard).join('')
      : '<div class="empty-state" style="grid-column:1/-1"><div class="big">🔍</div><h2>Nothing found</h2><p>Try a different search or category.</p></div>';
  };
  $$('.chip', view).forEach(ch => ch.addEventListener('click', () => {
    history.replaceState({}, '', '/shop?cat=' + ch.dataset.cat);
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
    <p style="margin-bottom:18px;font-size:0.85rem"><a href="/shop" data-link>Shop</a> / <a href="/shop?cat=${p.category}" data-link>${esc(p.category)}'s</a> / <span style="color:var(--ink-faint)">${esc(p.name)}</span></p>
    <div class="pdp">
      <div class="pdp-img"><img src="${esc(p.image)}" alt="${esc(p.name)}"></div>
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
    <div class="section-head"><div><h2>Pairs well with</h2><p>More ${esc(p.category)}'s essentials.</p></div><a href="/shop?cat=${p.category}" data-link>View all →</a></div>
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
    $('#view').innerHTML = `<div class="empty-state container"><div class="big">🛍️</div><h2>Your cart is empty</h2><p>Fill it with something soft.</p><a href="/shop" data-link class="btn btn-dark">Start shopping</a></div>`;
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
          <a href="/product/${i.productId}" data-link><img src="${esc(i.image)}" alt=""></a>
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
        <a href="/checkout" data-link class="btn btn-green btn-block">Checkout · ${inr(total)}</a>
        <br><a href="/shop" data-link style="display:block;text-align:center;margin-top:14px;font-weight:700;font-size:0.9rem">Continue shopping</a>
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
  if (!items.length) { history.pushState({}, '', '/cart'); return viewCart(); }

  let screenshotFile = null;
  $('#view').innerHTML = `
  <section class="section container">
    <div class="section-head"><div><h2>Checkout</h2><p>Pay via UPI, upload your screenshot, done.</p></div></div>
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
            <img src="${esc(i.image)}" alt="">
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
      history.pushState({}, '', '/order-success?no=' + order_no);
      render();
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
    <p style="color:var(--ink-soft)">We received your order and payment screenshot. We'll verify your payment and confirm shortly.</p>
    <div class="order-no-chip">${esc(no)}</div>
    <p style="font-size:0.85rem;color:var(--ink-faint)">Save this order number — you can track your order with it anytime.</p>
    <div style="display:flex;gap:14px;justify-content:center;margin-top:28px;flex-wrap:wrap">
      <a href="/track" data-link class="btn btn-dark">Track order</a>
      <a href="/shop" data-link class="btn btn-outline">Keep shopping</a>
    </div>
  </div>`;
}

function authForm(mode) {
  const isLogin = mode === 'login';
  $('#view').innerHTML = `
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>${isLogin ? 'Welcome back' : 'Join MyKala'}</h1>
      <p class="sub">${isLogin ? 'Log in to track orders and check out faster.' : 'Create an account to track orders and check out faster.'}</p>
      <div class="form-error" id="authErr" style="display:none"></div>
      ${isLogin ? '' : `
      <div class="field"><label>Full name</label><input id="aName" placeholder="Your name"></div>
      <div class="field"><label>Phone</label><input id="aPhone" placeholder="9876543210" maxlength="10" inputmode="numeric"></div>`}
      <div class="field"><label>Email</label><input id="aEmail" type="email" placeholder="you@email.com"></div>
      <div class="field"><label>Password</label><input id="aPass" type="password" placeholder="${isLogin ? 'Your password' : 'At least 6 characters'}"></div>
      <button class="btn btn-dark btn-block" id="authBtn">${isLogin ? 'Log in' : 'Create account'}</button>
      <p class="auth-alt">${isLogin ? `New here? <a href="/signup" data-link>Create an account</a>` : `Already have an account? <a href="/login" data-link>Log in</a>`}</p>
      ${isLogin ? '<p class="auth-alt" style="font-size:0.8rem;color:var(--ink-faint)">Store owner? <a href="/admin">Admin login →</a></p>' : ''}
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
      toast(isLogin ? `Welcome back, ${user.name.split(' ')[0]}!` : `Welcome to MyKala, ${user.name.split(' ')[0]}!`);
      history.pushState({}, '', '/account');
      render();
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
      <div><b>${esc(o.order_no)}</b><div class="oc-date">${new Date(o.created_at + 'Z').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
      <span class="status-badge status-${esc(o.status)}">${esc(o.status)}</span>
    </div>
    <ul class="order-lines">
      ${o.items.map(i => `<li><span>${esc(i.name)} · ${esc(i.size)} × ${i.qty}</span><span>${inr(i.price * i.qty)}</span></li>`).join('')}
    </ul>
    <div class="order-total-row"><span>Total paid</span><span>${inr(o.total)}</span></div>
  </div>`;
}

async function viewAccount() {
  if (!state.user) { history.pushState({}, '', '/login'); return viewLogin(); }
  const { orders } = await api('/api/orders');
  $('#view').innerHTML = `
  <section class="section container">
    <div class="account-head">
      <div class="avatar">${esc(state.user.name[0]?.toUpperCase() || 'M')}</div>
      <div><h1>Hi, ${esc(state.user.name.split(' ')[0])}</h1><p>${esc(state.user.email)}${state.user.phone ? ' · ' + esc(state.user.phone) : ''}</p></div>
      <button class="btn btn-outline btn-sm" id="logoutBtn" style="margin-left:auto">Log out</button>
    </div>
    <div class="section-head"><div><h2>My orders</h2><p>${orders.length} order${orders.length !== 1 ? 's' : ''} so far</p></div></div>
    ${orders.length ? orders.map(orderCardHtml).join('') : '<div class="empty-state"><div class="big">📦</div><h2>No orders yet</h2><p>Your orders will appear here.</p><a href="/shop" data-link class="btn btn-dark">Start shopping</a></div>'}
  </section>`;
  $('#logoutBtn').onclick = async () => {
    await api('/api/auth/logout', { method: 'POST' });
    state.user = null;
    toast('Logged out. See you soon!');
    history.pushState({}, '', '/');
    render();
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

/* ---------- boot ---------- */
(async function boot() {
  updateCartCount();
  try {
    const [me, settings] = await Promise.all([api('/api/auth/me'), api('/api/settings')]);
    state.user = me.user;
    state.settings = settings;
  } catch (_) {}
  render();
})();
