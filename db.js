const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, 'mykala.db'));
db.pragma('journal_mode = WAL');

// ---------- schema ----------
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT DEFAULT '',
  password_hash TEXT NOT NULL,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'unisex',
  description TEXT DEFAULT '',
  price INTEGER NOT NULL,
  image TEXT DEFAULT '',
  sizes TEXT NOT NULL DEFAULT 'S,M,L,XL',
  stock INTEGER NOT NULL DEFAULT 25,
  featured INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_no TEXT NOT NULL UNIQUE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  email TEXT DEFAULT '',
  phone TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  notes TEXT DEFAULT '',
  items_json TEXT NOT NULL,
  subtotal INTEGER NOT NULL,
  shipping INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL,
  payment_method TEXT NOT NULL DEFAULT 'upi',
  payment_ref TEXT DEFAULT '',
  payment_screenshot TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('upi_id', 'mykala@upi'),
  ('upi_name', 'MyKala Store'),
  ('store_note', 'Pay securely via any UPI app (GPay, PhonePe, Paytm). Upload your payment screenshot and we will confirm your order after verifying the payment.');
`);

// ---------- seed ----------
function seed() {
  const adminEmail = 'admin@mykala.store';
  const hasAdmin = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!hasAdmin) {
    db.prepare(
      'INSERT INTO users (name, email, phone, password_hash, is_admin) VALUES (?, ?, ?, ?, 1)'
    ).run('Store Admin', adminEmail, '', bcrypt.hashSync('admin123', 10));
  }

  const hasProducts = db.prepare('SELECT COUNT(*) AS c FROM products').get().c > 0;
  if (!hasProducts) {
    const insert = db.prepare(`
      INSERT INTO products (name, category, description, price, image, sizes, stock, featured)
      VALUES (@name, @category, @description, @price, @image, @sizes, @stock, @featured)
    `);
    const products = [
      {
        name: 'The Original Tee',
        category: 'men',
        description: 'Our signature tee made from 100% organic combed cotton. Pre-shrunk, breathable, and absurdly soft — it only gets better with every wash.',
        price: 799, image: '/images/products/tee-grey.jpg', sizes: 'S,M,L,XL,XXL', stock: 40, featured: 1,
      },
      {
        name: 'The All-Day Hoodie',
        category: 'men',
        description: 'A heavyweight fleece hoodie with a brushed interior, kangaroo pocket and ribbed cuffs. Warm enough for winter evenings, light enough for all day.',
        price: 999, image: '/images/products/hoodie-olive.jpg', sizes: 'S,M,L,XL', stock: 30, featured: 1,
      },
      {
        name: 'The Relaxed Shirt',
        category: 'men',
        description: 'An easy, relaxed-fit button-up in a breathable cotton weave. Dress it up with chinos or wear it open over a tee — it works either way.',
        price: 899, image: '/images/products/shirt-sand.jpg', sizes: 'S,M,L,XL', stock: 25, featured: 0,
      },
      {
        name: 'The Motion Jogger',
        category: 'men',
        description: 'Four-way stretch joggers with a drawstring waist, tapered leg and deep side pockets. Made for morning runs and lazy Sundays alike.',
        price: 849, image: '/images/products/jogger-charcoal.jpg', sizes: 'S,M,L,XL', stock: 35, featured: 0,
      },
      {
        name: 'The CloudSoft Tee',
        category: 'women',
        description: 'A relaxed-fit women’s tee in our softest cotton jersey, with a flattering drape and drop shoulders. The one you’ll reach for every single week.',
        price: 699, image: '/images/products/tee-white.jpg', sizes: 'XS,S,M,L,XL', stock: 45, featured: 1,
      },
      {
        name: 'The Breezy Dress',
        category: 'women',
        description: 'A flowy midi dress with short sleeves and side pockets (yes, real pockets). Light, airy, and endlessly wearable from brunch to sunset.',
        price: 949, image: '/images/products/dress-terracotta.jpg', sizes: 'XS,S,M,L,XL', stock: 20, featured: 1,
      },
      {
        name: 'The Cozy Knit Sweater',
        category: 'women',
        description: 'A chunky-knit sweater with a slightly oversized fit and ribbed hem. Like wearing a warm hug, but make it fashion.',
        price: 999, image: '/images/products/sweater-cream.jpg', sizes: 'S,M,L,XL', stock: 22, featured: 0,
      },
      {
        name: 'The Classic Denim Jacket',
        category: 'unisex',
        description: 'A timeless light-wash denim jacket with metal buttons and two chest pockets. The layer that finishes every outfit, season after season.',
        price: 999, image: '/images/products/denim-jacket.jpg', sizes: 'S,M,L,XL', stock: 18, featured: 1,
      },
    ];
    for (const p of products) insert.run(p);
  }
}

seed();

module.exports = db;
