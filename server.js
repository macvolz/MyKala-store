const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const bcrypt = require('bcryptjs');

const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.disable('x-powered-by');

// ---------- static ----------
app.use(express.static(path.join(__dirname, 'public')));
const UPLOAD_DIR = path.join(__dirname, 'uploads');
for (const sub of ['products', 'payments']) {
  const d = path.join(UPLOAD_DIR, sub);
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
app.use('/uploads', express.static(UPLOAD_DIR));

// ---------- multer ----------
const IMAGE_TYPES = /^image\/(jpeg|jpg|png|webp)$/;

function makeUpload(sub) {
  return multer({
    storage: multer.diskStorage({
      destination: path.join(UPLOAD_DIR, sub),
      filename: (req, file, cb) => {
        const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
      },
    }),
    fileFilter: (req, file, cb) => {
      if (!IMAGE_TYPES.test(file.mimetype)) return cb(new Error('Only JPG, PNG or WEBP images are allowed'));
      cb(null, true);
    },
    limits: { fileSize: 8 * 1024 * 1024 },
  });
}
const uploadProduct = makeUpload('products');
const uploadPayment = makeUpload('payments');

// ---------- helpers ----------
function getSetting(key, fallback = '') {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value);
}

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', path: '/' };

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > -1) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

app.use((req, res, next) => {
  const token = parseCookies(req).mk_session;
  req.user = null;
  if (token) {
    const row = db.prepare(
      'SELECT u.id, u.name, u.email, u.phone, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?'
    ).get(token);
    if (row) req.user = row;
  }
  next();
});

function requireLogin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Please log in first' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.user || !req.user.is_admin) return res.status(403).json({ error: 'Admin access required' });
  next();
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email, phone: u.phone, is_admin: !!u.is_admin };
}

function makeOrderNo() {
  return 'MK' + Date.now().toString(36).toUpperCase().slice(-5) + crypto.randomBytes(2).toString('hex').toUpperCase();
}

const ORDER_STATUSES = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];

// ---------- auth ----------
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password, phone } = req.body || {};
  if (!name || !email || !password) return res.status(400).json({ error: 'Name, email and password are required' });
  if (String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'An account with this email already exists. Try logging in.' });
  }
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db.prepare('INSERT INTO users (name, email, phone, password_hash) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.trim().toLowerCase(), (phone || '').trim(), hash);
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, info.lastInsertRowid);
  res.setHeader('Set-Cookie', `mk_session=${token}; ${Object.entries(COOKIE_OPTS).map(([k, v]) => `${k}=${v}`).join('; ')}`);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required' });
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email).trim());
  if (!user || !bcrypt.compareSync(String(password), user.password_hash)) {
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id) VALUES (?, ?)').run(token, user.id);
  res.setHeader('Set-Cookie', `mk_session=${token}; ${Object.entries(COOKIE_OPTS).map(([k, v]) => `${k}=${v}`).join('; ')}`);
  res.json({ user: publicUser(user) });
});

app.post('/api/auth/logout', (req, res) => {
  const token = parseCookies(req).mk_session;
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', 'mk_session=; Path=/; Max-Age=0');
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  res.json({ user: req.user });
});

// ---------- products (public) ----------
function productOut(p) {
  return { ...p, sizes: p.sizes ? p.sizes.split(',').filter(Boolean) : [], featured: !!p.featured, active: !!p.active };
}

app.get('/api/products', (req, res) => {
  const { category, search, featured } = req.query;
  let sql = 'SELECT * FROM products WHERE active = 1';
  const args = [];
  if (category && category !== 'all') { sql += ' AND category = ?'; args.push(category); }
  if (featured === '1') sql += ' AND featured = 1';
  if (search) { sql += ' AND (name LIKE ? OR description LIKE ?)'; args.push(`%${search}%`, `%${search}%`); }
  sql += ' ORDER BY featured DESC, id ASC';
  res.json({ products: db.prepare(sql).all(...args).map(productOut) });
});

app.get('/api/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'Product not found' });
  res.json({ product: productOut(p) });
});

app.get('/api/settings', (req, res) => {
  res.json({ upi_id: getSetting('upi_id'), upi_name: getSetting('upi_name'), store_note: getSetting('store_note') });
});

// ---------- orders (customer) ----------
function orderOut(o) {
  let items = [];
  try { items = JSON.parse(o.items_json); } catch (_) {}
  return { ...o, items, has_screenshot: !!o.payment_screenshot };
}

app.post('/api/orders', uploadPayment.single('screenshot'), (req, res) => {
  const b = req.body || {};
  let items = [];
  try { items = JSON.parse(b.items || '[]'); } catch (_) { return res.status(400).json({ error: 'Invalid cart data' }); }
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty' });

  // recompute prices server-side from the DB (never trust the client)
  let subtotal = 0;
  const prepared = [];
  for (const it of items) {
    const p = db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(it.productId);
    if (!p) return res.status(400).json({ error: 'A product in your cart is no longer available' });
    const qty = Math.max(1, Math.min(10, parseInt(it.qty, 10) || 1));
    const size = p.sizes.split(',').includes(it.size) ? it.size : p.sizes.split(',')[0];
    subtotal += p.price * qty;
    prepared.push({ productId: p.id, name: p.name, price: p.price, image: p.image, size, qty });
  }
  const shipping = subtotal >= 999 ? 0 : 49;
  const total = subtotal + shipping;

  const required = ['customer_name', 'phone', 'address', 'city', 'state', 'pincode'];
  for (const f of required) {
    if (!b[f] || !String(b[f]).trim()) return res.status(400).json({ error: 'Please fill in all delivery details' });
  }
  if (!/^\d{10}$/.test(String(b.phone).trim())) return res.status(400).json({ error: 'Please enter a valid 10-digit phone number' });
  if (!/^\d{6}$/.test(String(b.pincode).trim())) return res.status(400).json({ error: 'Please enter a valid 6-digit pincode' });

  if (!req.file) return res.status(400).json({ error: 'Please upload your payment screenshot so we can verify your UPI payment' });

  const orderNo = makeOrderNo();
  db.prepare(`
    INSERT INTO orders (order_no, user_id, customer_name, email, phone, address, city, state, pincode, notes,
      items_json, subtotal, shipping, total, payment_method, payment_ref, payment_screenshot, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'upi', ?, ?, 'pending')
  `).run(
    orderNo,
    req.user ? req.user.id : null,
    String(b.customer_name).trim(),
    String(b.email || '').trim(),
    String(b.phone).trim(),
    String(b.address).trim(),
    String(b.city).trim(),
    String(b.state).trim(),
    String(b.pincode).trim(),
    String(b.notes || '').trim(),
    JSON.stringify(prepared),
    subtotal,
    shipping,
    total,
    String(b.payment_ref || '').trim(),
    '/uploads/payments/' + req.file.filename
  );

  // decrement stock
  for (const it of prepared) {
    db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?').run(it.qty, it.productId);
  }

  res.json({ order_no: orderNo, total });
});

app.get('/api/orders', requireLogin, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  res.json({ orders: rows.map(orderOut) });
});

// track order by number + phone (for guests)
app.post('/api/orders/track', (req, res) => {
  const { order_no, phone } = req.body || {};
  if (!order_no || !phone) return res.status(400).json({ error: 'Order number and phone are required' });
  const o = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(String(order_no).trim().toUpperCase());
  if (!o || o.phone !== String(phone).trim()) return res.status(404).json({ error: 'No order found with that number and phone combination' });
  res.json({ order: orderOut(o) });
});

// ---------- admin ----------
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const orders = db.prepare("SELECT COUNT(*) c FROM orders WHERE status != 'cancelled'").get().c;
  const revenue = db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status IN ('confirmed','shipped','delivered')").get().s;
  const pending = db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").get().c;
  const customers = db.prepare('SELECT COUNT(*) c FROM users WHERE is_admin = 0').get().c;
  const products = db.prepare('SELECT COUNT(*) c FROM products WHERE active = 1').get().c;
  const recent = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 6').all();
  res.json({ orders, revenue, pending, customers, products, recent: recent.map(orderOut) });
});

app.get('/api/admin/orders', requireAdmin, (req, res) => {
  const { status } = req.query;
  let rows;
  if (status && status !== 'all') {
    rows = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC').all(status);
  } else {
    rows = db.prepare('SELECT * FROM orders ORDER BY id DESC').all();
  }
  res.json({ orders: rows.map(orderOut) });
});

app.patch('/api/admin/orders/:id', requireAdmin, (req, res) => {
  const { status } = req.body || {};
  if (!ORDER_STATUSES.includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const info = db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Order not found' });
  res.json({ ok: true });
});

app.get('/api/admin/customers', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT u.id, u.name, u.email, u.phone, u.created_at,
      COUNT(o.id) AS order_count,
      COALESCE(SUM(CASE WHEN o.status != 'cancelled' THEN o.total ELSE 0 END), 0) AS total_spent
    FROM users u LEFT JOIN orders o ON o.user_id = u.id
    WHERE u.is_admin = 0
    GROUP BY u.id ORDER BY u.created_at DESC
  `).all();
  res.json({ customers: rows });
});

function validateProduct(b, fileRequired) {
  const name = String(b.name || '').trim();
  const price = parseInt(b.price, 10);
  const stock = parseInt(b.stock, 10);
  if (!name) return { error: 'Product name is required' };
  if (!Number.isFinite(price) || price < 1 || price > 999) return { error: 'Price must be between ₹1 and ₹999 (everything on MyKala stays under ₹1000)' };
  if (fileRequired && !b.image) return { error: 'Please upload a product photo' };
  const cat = ['men', 'women', 'unisex'].includes(b.category) ? b.category : 'unisex';
  let sizes = String(b.sizes || 'S,M,L,XL').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
  if (sizes.length === 0) sizes = ['S', 'M', 'L', 'XL'];
  return {
    value: {
      name,
      category: cat,
      description: String(b.description || '').trim(),
      price,
      sizes: [...new Set(sizes)].join(','),
      stock: Number.isFinite(stock) && stock >= 0 ? stock : 25,
      featured: b.featured === '1' || b.featured === 'true' || b.featured === true ? 1 : 0,
    }
  };
}

app.get('/api/admin/products', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM products ORDER BY id DESC').all();
  res.json({ products: rows.map(productOut) });
});

app.post('/api/admin/products', requireAdmin, uploadProduct.single('image'), (req, res) => {
  const check = validateProduct(req.body, !req.file);
  if (check.error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: check.error });
  }
  const v = check.value;
  const info = db.prepare(`
    INSERT INTO products (name, category, description, price, image, sizes, stock, featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(v.name, v.category, v.description, v.price, req.file ? '/uploads/products/' + req.file.filename : '', v.sizes, v.stock, v.featured);
  res.json({ product: productOut(db.prepare('SELECT * FROM products WHERE id = ?').get(info.lastInsertRowid)) });
});

app.put('/api/admin/products/:id', requireAdmin, uploadProduct.single('image'), (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });
  const check = validateProduct(req.body, false);
  if (check.error) {
    if (req.file) fs.unlink(req.file.path, () => {});
    return res.status(400).json({ error: check.error });
  }
  const v = check.value;
  const image = req.file ? '/uploads/products/' + req.file.filename : existing.image;
  db.prepare(`
    UPDATE products SET name=?, category=?, description=?, price=?, image=?, sizes=?, stock=?, featured=? WHERE id=?
  `).run(v.name, v.category, v.description, v.price, image, v.sizes, v.stock, v.featured, existing.id);
  res.json({ product: productOut(db.prepare('SELECT * FROM products WHERE id = ?').get(existing.id)) });
});

app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
  const info = db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  if (!info.changes) return res.status(404).json({ error: 'Product not found' });
  res.json({ ok: true });
});

app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({
    upi_id: getSetting('upi_id'),
    upi_name: getSetting('upi_name'),
    store_note: getSetting('store_note'),
  });
});

app.put('/api/admin/settings', requireAdmin, (req, res) => {
  const { upi_id, upi_name, store_note } = req.body || {};
  if (upi_id) setSetting('upi_id', String(upi_id).trim());
  if (upi_name) setSetting('upi_name', String(upi_name).trim());
  if (store_note !== undefined) setSetting('store_note', String(store_note).trim());
  res.json({ ok: true });
});

// ---------- pages (fallback middleware: works for all unmatched GETs) ----------
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  if (req.path === '/admin' || req.path.startsWith('/admin/')) {
    return res.sendFile(path.join(__dirname, 'public', 'admin.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// multer / generic error handler
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File too large (max 8MB)' : 'Upload error: ' + err.message });
  }
  if (err) return res.status(400).json({ error: err.message || 'Something went wrong' });
  next();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`MyKala store running on http://0.0.0.0:${PORT}`);
});
