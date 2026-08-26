/* ============ MyKala Admin app ============ */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const inr = n => '₹' + Number(n).toLocaleString('en-IN');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fdate = d => d ? new Date(d + (d.includes('T') ? '' : 'Z')).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

let me = null;
let currentView = 'dashboard';
let cached = { orders: [], products: [], customers: [] };

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: opts.body && !(opts.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {},
    body: opts.body && !(opts.body instanceof FormData) ? JSON.stringify(opts.body) : opts.body,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 403 && me?.is_admin) { me = null; boot(); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong');
  return data;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove('show'), 2400);
}

/* ============ login ============ */
function renderLogin(error = '') {
  document.body.style.background = '';
  $('#adminRoot').innerHTML = `
  <div class="admin-login">
    <div class="login-card">
      <div class="logo">mykala<span>.</span>admin</div>
      <h1>Welcome back, boss 👋</h1>
      <p class="sub">Log in to manage orders, products and customers.</p>
      ${error ? `<div class="form-error">${esc(error)}</div>` : ''}
      <div class="field"><label>Email</label><input id="lEmail" type="email" placeholder="admin@mykala.store"></div>
      <div class="field"><label>Password</label><input id="lPass" type="password" placeholder="••••••••"></div>
      <button class="btn btn-dark" id="lBtn" style="width:100%">Log in to dashboard</button>
      <div class="login-hint">Demo credentials — <code>admin@mykala.store</code> / <code>admin123</code>. Change the password after first login by updating your user from the Customers screen isn't needed — keep this secret!</div>
    </div>
  </div>`;
  const go = async () => {
    const btn = $('#lBtn');
    btn.disabled = true; btn.textContent = 'Logging in…';
    try {
      const { user } = await api('/api/auth/login', { method: 'POST', body: { email: $('#lEmail').value, password: $('#lPass').value } });
      if (!user.is_admin) return renderLogin('This account does not have admin access.');
      me = user;
      renderShell();
    } catch (e) {
      renderLogin(e.message);
    }
  };
  $('#lBtn').onclick = go;
  $('#lPass').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
}

/* ============ shell ============ */
const NAV = [
  ['dashboard', '📊', 'Dashboard'],
  ['orders', '📦', 'Orders'],
  ['products', '👕', 'Products'],
  ['customers', '👥', 'Customers'],
  ['settings', '⚙️', 'Settings'],
];

function renderShell() {
  $('#adminRoot').innerHTML = `
  <div class="shell">
    <aside class="sidebar">
      <div class="logo">mykala<span>.</span><small>Admin panel</small></div>
      ${NAV.map(([id, ic, label]) => `<button class="side-link" data-view="${id}"><span class="ic">${ic}</span>${label}</button>`).join('')}
      <div class="spacer"></div>
      <a class="side-link" href="/" target="_blank"><span class="ic">🛍️</span>View store</a>
      <div class="side-logout"><button class="side-link" id="aLogout"><span class="ic">↩️</span>Log out</button></div>
    </aside>
    <main class="main" id="mainArea"></main>
  </div>`;
  $$('.side-link[data-view]').forEach(b => b.onclick = () => go(b.dataset.view));
  $('#aLogout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }); me = null; boot(); };
  go(currentView);
}

async function go(view) {
  currentView = view;
  $$('.side-link[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const main = $('#mainArea');
  main.innerHTML = '<p style="color:var(--ink-faint)">Loading…</p>';
  try {
    if (view === 'dashboard') await viewDashboard(main);
    if (view === 'orders') await viewOrders(main);
    if (view === 'products') await viewProducts(main);
    if (view === 'customers') await viewCustomers(main);
    if (view === 'settings') await viewSettings(main);
  } catch (e) {
    main.innerHTML = `<div class="card"><div class="form-error">${esc(e.message)}</div></div>`;
  }
}

/* ============ dashboard ============ */
async function viewDashboard(main) {
  const s = await api('/api/admin/stats');
  main.innerHTML = `
    <div class="page-head"><div><h1>Dashboard</h1><p>Here's how your store is doing${me ? `, ${esc(me.name.split(' ')[0])}` : ''}.</p></div>
    <button class="btn btn-green" id="goOrders">Review pending payments (${s.pending})</button></div>
    <div class="stat-grid">
      <div class="stat"><span class="ic">💰</span><b>${inr(s.revenue)}</b><span>Revenue (confirmed)</span></div>
      <div class="stat"><span class="ic">📦</span><b>${s.orders}</b><span>Total orders</span></div>
      <div class="stat"><span class="ic">⏳</span><b>${s.pending}</b><span>Pending verification</span></div>
      <div class="stat"><span class="ic">👥</span><b>${s.customers}</b><span>Registered customers</span></div>
      <div class="stat"><span class="ic">👕</span><b>${s.products}</b><span>Active products</span></div>
    </div>
    <div class="card">
      <h2>Recent orders</h2>
      <div class="table-wrap"><table>
        <thead><tr><th>Order</th><th>Customer</th><th>Payment proof</th><th>Total</th><th>Status</th></tr></thead>
        <tbody>
          ${s.recent.map(o => `
          <tr class="clickable" data-order="${o.id}">
            <td class="td-strong">${esc(o.order_no)}<div class="td-muted">${fdate(o.created_at)}</div></td>
            <td>${esc(o.customer_name)}<div class="td-muted">${esc(o.phone)}</div></td>
            <td>${o.has_screenshot ? '✅ Uploaded' : '—'}</td>
            <td class="td-strong">${inr(o.total)}</td>
            <td><span class="status-badge status-${esc(o.status)}">${esc(o.status)}</span></td>
          </tr>`).join('')}
        </tbody>
      </table></div>
    </div>`;
  $('#goOrders').onclick = () => go('orders');
  $$('tr[data-order]', main).forEach(tr => tr.onclick = () => openOrderModal(Number(tr.dataset.order), () => go('dashboard')));
}

/* ============ orders ============ */
async function viewOrders(main) {
  const { orders } = await api('/api/admin/orders');
  cached.orders = orders;
  main.innerHTML = `
    <div class="page-head"><div><h1>Orders</h1><p>${orders.length} total · click any order for full details & payment proof</p></div></div>
    <div class="chips" style="margin-bottom:20px" id="statusChips">
      ${['all', 'pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(s =>
        `<button class="chip ${s === 'all' ? 'active' : ''}" data-s="${s}">${s[0].toUpperCase() + s.slice(1)}</button>`).join('')}
    </div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Order</th><th>Customer</th><th>Delivery</th><th>Items</th><th>Payment proof</th><th>Total</th><th>Status</th></tr></thead>
      <tbody id="ordersBody"></tbody>
    </table></div></div>`;

  const draw = status => {
    const list = status === 'all' ? cached.orders : cached.orders.filter(o => o.status === status);
    $('#ordersBody').innerHTML = list.length ? list.map(o => `
      <tr class="clickable" data-order="${o.id}">
        <td class="td-strong">${esc(o.order_no)}<div class="td-muted">${fdate(o.created_at)}</div></td>
        <td>${esc(o.customer_name)}<div class="td-muted">${esc(o.phone)}</div></td>
        <td><span class="td-muted">${esc(o.city)}, ${esc(o.state)} · ${esc(o.pincode)}</span></td>
        <td>${o.items.reduce((a, i) => a + i.qty, 0)} item(s)</td>
        <td>${o.has_screenshot ? '📸 <a href="#" class="view-shot">View</a>' : '—'}</td>
        <td class="td-strong">${inr(o.total)}</td>
        <td><span class="status-badge status-${esc(o.status)}">${esc(o.status)}</span></td>
      </tr>`).join('')
      : `<tr><td colspan="7" style="text-align:center;color:var(--ink-faint);padding:34px">No ${status === 'all' ? '' : status + ' '}orders yet</td></tr>`;
    $$('tr[data-order]', main).forEach(tr => tr.onclick = () => openOrderModal(Number(tr.dataset.order), () => viewOrders(main)));
  };
  $$('#statusChips .chip', main).forEach(c => c.onclick = () => {
    $$('#statusChips .chip', main).forEach(x => x.classList.toggle('active', x === c));
    draw(c.dataset.s);
  });
  draw('all');
}

async function openOrderModal(id, refresh) {
  const o = cached.orders.find(x => x.id === id) || (await api('/api/admin/orders')).orders.find(x => x.id === id);
  if (!o) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-back';
  backdrop.innerHTML = `
  <div class="modal">
    <div class="modal-head">
      <div><h2>${esc(o.order_no)}</h2>
        <span class="status-badge status-${esc(o.status)}" id="omStatus">${esc(o.status)}</span>
        <span class="td-muted"> · placed ${fdate(o.created_at)}</span>
        ${o.user_id ? '<span class="tag" style="margin-left:8px">registered customer</span>' : '<span class="tag warn" style="margin-left:8px">guest</span>'}
      </div>
      <button class="modal-close" id="omClose">✕</button>
    </div>
    <div class="detail-grid">
      <div class="detail-box">
        <h3>Customer & delivery</h3>
        <div class="row"><span>Name</span><span>${esc(o.customer_name)}</span></div>
        <div class="row"><span>Phone</span><span><a href="tel:${esc(o.phone)}">${esc(o.phone)}</a></span></div>
        <div class="row"><span>Email</span><span>${esc(o.email) || '—'}</span></div>
        <div class="row"><span>Address</span><span style="max-width:210px">${esc(o.address)}</span></div>
        <div class="row"><span>City / State</span><span>${esc(o.city)}, ${esc(o.state)}</span></div>
        <div class="row"><span>Pincode</span><span>${esc(o.pincode)}</span></div>
        ${o.notes ? `<div class="row"><span>Notes</span><span>${esc(o.notes)}</span></div>` : ''}
      </div>
      <div class="detail-box shot-box">
        <h3>Payment proof (UPI screenshot)</h3>
        ${o.payment_screenshot
          ? `<img src="${esc(o.payment_screenshot)}" alt="Payment screenshot" onclick="window.open('${esc(o.payment_screenshot)}','_blank')" style="cursor:zoom-in">
             <a href="${esc(o.payment_screenshot)}" target="_blank">Open full size ↗</a>
             ${o.payment_ref ? `<div class="row" style="margin-top:8px"><span>Ref / txn no.</span><span>${esc(o.payment_ref)}</span></div>` : ''}`
          : '<p style="color:var(--ink-faint);font-size:0.9rem">No screenshot uploaded.</p>'}
      </div>
    </div>
    <div class="detail-box" style="margin-top:18px">
      <h3>Items</h3>
      ${o.items.map(i => `
      <div class="item-line">
        <img src="${esc(i.image)}" alt="">
        <div><b>${esc(i.name)}</b><span>Size ${esc(i.size)} · Qty ${i.qty}</span></div>
        <div style="margin-left:auto;font-weight:800">${inr(i.price * i.qty)}</div>
      </div>`).join('')}
      <div class="row" style="margin-top:8px"><span>Subtotal</span><span>${inr(o.subtotal)}</span></div>
      <div class="row"><span>Shipping</span><span>${o.shipping === 0 ? 'FREE' : inr(o.shipping)}</span></div>
      <div class="row" style="border-top:1px solid var(--line);margin-top:6px;padding-top:8px"><span>Total paid</span><span>${inr(o.total)}</span></div>
    </div>
    <div class="status-select-row">
      <label style="font-weight:700;font-size:0.85rem">Update status:</label>
      <select id="omSelect">
        ${['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map(s => `<option value="${s}" ${s === o.status ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}
      </select>
      <button class="btn btn-green btn-sm" id="omSave">Save</button>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  backdrop.onclick = e => { if (e.target === backdrop) backdrop.remove(); };
  $('#omClose', backdrop).onclick = () => backdrop.remove();
  $('#omSave', backdrop).onclick = async () => {
    try {
      await api('/api/admin/orders/' + o.id, { method: 'PATCH', body: { status: $('#omSelect', backdrop).value } });
      toast('Order updated ✓');
      backdrop.remove();
      refresh && refresh();
    } catch (e) { toast(e.message); }
  };
}

/* ============ products ============ */
async function viewProducts(main) {
  const { products } = await api('/api/admin/products');
  cached.products = products;
  main.innerHTML = `
    <div class="page-head"><div><h1>Products</h1><p>${products.filter(p => p.active).length} active · every price capped at ₹999</p></div>
    <button class="btn btn-green" id="addProdBtn">+ Add product</button></div>
    <div class="prod-grid">
      ${products.map(p => `
      <div class="prod-tile">
        <img src="${esc(p.image)}" alt="">
        <div class="pt-body">
          <h3>${esc(p.name)}</h3>
          <div class="pt-meta">${esc(p.category)}'s · sizes ${p.sizes.join(', ')}</div>
          <div class="pt-price">${inr(p.price)}</div>
          ${p.featured ? '<span class="tag">Featured</span>' : ''}
          <span class="tag ${p.stock <= 5 ? 'warn' : ''}">${p.stock <= 0 ? 'Sold out' : p.stock + ' in stock'}</span>
          ${p.active ? '' : '<span class="tag warn">Hidden</span>'}
          <div class="pt-actions">
            <button class="btn btn-outline btn-sm" data-edit="${p.id}">Edit</button>
            <button class="btn btn-danger btn-sm" data-del="${p.id}">Remove</button>
          </div>
        </div>
      </div>`).join('')}
    </div>`;
  $('#addProdBtn').onclick = () => openProductModal(null, () => viewProducts(main));
  $$('[data-edit]', main).forEach(b => b.onclick = () => openProductModal(products.find(p => p.id === Number(b.dataset.edit)), () => viewProducts(main)));
  $$('[data-del]', main).forEach(b => b.onclick = async () => {
    if (!confirm('Remove this product from the store?')) return;
    try {
      await api('/api/admin/products/' + b.dataset.del, { method: 'DELETE' });
      toast('Product removed');
      viewProducts(main);
    } catch (e) { toast(e.message); }
  });
}

function openProductModal(p, refresh) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-back';
  backdrop.innerHTML = `
  <div class="modal" style="width:min(560px,100%)">
    <div class="modal-head"><h2>${p ? 'Edit product' : 'Add new product'}</h2><button class="modal-close" id="pmClose">✕</button></div>
    <div class="form-error" id="pmErr" style="display:none"></div>
    <div class="field"><label>Product name *</label><input id="pName" value="${esc(p?.name || '')}" placeholder="e.g. The Original Tee"></div>
    <div class="field-row">
      <div class="field"><label>Price (₹) * <span class="form-note">max ₹999</span></label><input id="pPrice" type="number" min="1" max="999" value="${p ? p.price : ''}" placeholder="e.g. 799"></div>
      <div class="field"><label>Stock</label><input id="pStock" type="number" min="0" value="${p ? p.stock : 25}"></div>
    </div>
    <div class="field-row">
      <div class="field"><label>Category</label>
        <select id="pCat">
          ${['men', 'women', 'unisex'].map(c => `<option value="${c}" ${p?.category === c ? 'selected' : ''}>${c[0].toUpperCase() + c.slice(1)}</option>`).join('')}
        </select></div>
      <div class="field"><label>Sizes (comma separated)</label><input id="pSizes" value="${esc(p?.sizes.join(',') || 'S,M,L,XL')}"></div>
    </div>
    <div class="field"><label>Description</label><textarea id="pDesc" placeholder="What makes this piece special?">${esc(p?.description || '')}</textarea></div>
    <div class="field">
      <label>Product photo ${p ? '' : '*'} — JPG / PNG / WEBP</label>
      <div class="upload-zone" id="pZone"><b>${p ? 'Choose a new photo (optional)' : '📤 Upload product photo'}</b><span>Current photo is kept if you don't pick one</span></div>
      <input type="file" id="pFile" accept="image/jpeg,image/png,image/webp" style="display:none">
      <div class="upload-preview" id="pPrev" style="display:none;margin-top:10px"><img id="pPrevImg" alt=""></div>
    </div>
    <div class="field"><label style="display:flex;align-items:center;gap:8px"><input type="checkbox" id="pFeat" style="width:auto" ${p?.featured ? 'checked' : ''}> Show on homepage as featured</label></div>
    <button class="btn btn-dark" id="pmSave" style="width:100%">${p ? 'Save changes' : 'Add product to store'}</button>
  </div>`;
  document.body.appendChild(backdrop);
  let file = null;
  backdrop.onclick = e => { if (e.target === backdrop) backdrop.remove(); };
  $('#pmClose', backdrop).onclick = () => backdrop.remove();
  $('#pZone', backdrop).onclick = () => $('#pFile', backdrop).click();
  $('#pFile', backdrop).onchange = e => {
    file = e.target.files[0] || null;
    if (file) {
      $('#pPrevImg', backdrop).src = URL.createObjectURL(file);
      $('#pPrev', backdrop).style.display = 'block';
      $('#pZone', backdrop).style.display = 'none';
    }
  };
  $('#pmSave', backdrop).onclick = async () => {
    const err = $('#pmErr', backdrop);
    err.style.display = 'none';
    const price = Number($('#pPrice', backdrop).value);
    if (price > 999) { err.textContent = 'Prices must stay under ₹1000 — that is the MyKala promise!'; err.style.display = 'block'; return; }
    const fd = new FormData();
    fd.append('name', $('#pName', backdrop).value);
    fd.append('price', price);
    fd.append('stock', $('#pStock', backdrop).value);
    fd.append('category', $('#pCat', backdrop).value);
    fd.append('sizes', $('#pSizes', backdrop).value);
    fd.append('description', $('#pDesc', backdrop).value);
    fd.append('featured', $('#pFeat', backdrop).checked ? '1' : '0');
    if (file) fd.append('image', file);
    const btn = $('#pmSave', backdrop);
    btn.disabled = true;
    try {
      await api(p ? '/api/admin/products/' + p.id : '/api/admin/products', { method: p ? 'PUT' : 'POST', body: fd });
      toast(p ? 'Product updated ✓' : 'Product added to store ✓');
      backdrop.remove();
      refresh && refresh();
    } catch (e) {
      err.textContent = e.message; err.style.display = 'block';
      btn.disabled = false;
    }
  };
}

/* ============ customers ============ */
async function viewCustomers(main) {
  const { customers } = await api('/api/admin/customers');
  main.innerHTML = `
    <div class="page-head"><div><h1>Customers</h1><p>${customers.length} registered accounts</p></div></div>
    <div class="card"><div class="table-wrap"><table>
      <thead><tr><th>Customer</th><th>Contact</th><th>Orders</th><th>Total spent</th><th>Joined</th></tr></thead>
      <tbody>
        ${customers.length ? customers.map(c => `
        <tr>
          <td><div style="display:flex;align-items:center;gap:12px">
            <div class="thumb" style="display:grid;place-items:center;background:var(--green-tint);color:var(--green);font-weight:800;border-radius:50%">${esc(c.name[0]?.toUpperCase() || '?')}</div>
            <span class="td-strong">${esc(c.name)}</span></div></td>
          <td>${esc(c.email)}${c.phone ? `<div class="td-muted">${esc(c.phone)}</div>` : ''}</td>
          <td class="td-strong">${c.order_count}</td>
          <td class="td-strong">${inr(c.total_spent)}</td>
          <td class="td-muted">${fdate(c.created_at)}</td>
        </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--ink-faint);padding:34px">No customers yet</td></tr>'}
      </tbody>
    </table></div></div>`;
}

/* ============ settings ============ */
async function viewSettings(main) {
  const s = await api('/api/admin/settings');
  main.innerHTML = `
    <div class="page-head"><div><h1>Settings</h1><p>Payment details customers see at checkout</p></div></div>
    <div class="card" style="max-width:620px">
      <div class="form-error" id="setErr" style="display:none"></div>
      <div class="field"><label>Your UPI ID (where customers send money)</label><input id="sUpi" value="${esc(s.upi_id)}" placeholder="yourname@okhdfcbank"></div>
      <div class="field"><label>Payee name shown to customers</label><input id="sName" value="${esc(s.upi_name)}"></div>
      <div class="field"><label>Payment instructions shown at checkout</label><textarea id="sNote">${esc(s.store_note)}</textarea></div>
      <button class="btn btn-green" id="sSave">Save settings</button>
    </div>`;
  $('#sSave', main).onclick = async () => {
    try {
      await api('/api/admin/settings', { method: 'PUT', body: { upi_id: $('#sUpi', main).value, upi_name: $('#sName', main).value, store_note: $('#sNote', main).value } });
      toast('Settings saved ✓');
    } catch (e) {
      const err = $('#setErr', main); err.textContent = e.message; err.style.display = 'block';
    }
  };
}

/* ============ boot ============ */
async function boot() {
  try {
    const r = await api('/api/auth/me');
    me = r.user;
  } catch (_) { me = null; }
  if (me && me.is_admin) renderShell();
  else renderLogin();
}
boot();
