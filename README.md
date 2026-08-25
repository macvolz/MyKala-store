# MyKala Store 🌱

An Allbirds-inspired clothing store — super soft, honestly priced essentials where **everything stays under ₹1000**.

Built with **Node.js + Express + SQLite** (no build step — just run it).

## ✨ What's inside

### Storefront (`/`)
- Allbirds-style clean, minimal design with product photography
- Home page with hero, featured products, category tiles
- Shop page with category filters (Men / Women / Unisex) + live search
- Product pages with size selection, quantity, stock status & related items
- Cart with free-shipping progress bar (free over ₹999, else flat ₹49)
- Customer **signup / login** (`/signup`, `/login`) and **My Account** with order history (`/account`)
- Guest-friendly **order tracking** by order number + phone (`/track`)

### Checkout with UPI payment screenshots
1. Customer fills delivery details (name, phone, address, city, state, pincode)
2. Pays your UPI ID (shown with a copy button)
3. **Uploads a payment screenshot** (JPG/PNG/WEBP, drag & drop supported) + optional txn reference
4. Order is placed as `pending` until you verify the payment in the admin panel

Prices and totals are always recomputed **server-side** — the client can't tamper with them.

### Admin panel (`/admin`)
- **Dashboard** — revenue, orders, pending verifications, customers, active products, recent orders
- **Orders** — full customer details (name, phone, email, address, pincode, notes), every item ordered, payment screenshot viewer, txn reference, and one-click status updates (pending → confirmed → shipped → delivered / cancelled)
- **Products** — add / edit / remove products with **photo upload**, and prices are hard-capped at **₹999**
- **Customers** — every registered account with order count and lifetime spend
- **Settings** — set your real UPI ID, payee name, and the payment instructions shown at checkout

## 🚀 Run it

```bash
npm install
npm start
# → http://localhost:3000
```

The database (`data/mykala.db`) is created and seeded automatically with 8 demo products.

## 🔑 Admin login

```
Email:    admin@mykala.store
Password: admin123
```

> ⚠️ Change this before going live (see below).

### Change the admin password

```bash
node -e "const b=require('bcryptjs'),d=require('better-sqlite3')('data/mykala.db');d.prepare('UPDATE users SET password_hash=? WHERE is_admin=1').run(b.hashSync('YOUR_NEW_PASSWORD',10))"
```

## 📁 Structure

```
server.js            Express app + REST API
db.js                SQLite schema + seed data
public/              Storefront (index.html, js/store.js, css/store.css)
public/admin.html    Admin panel (js/admin.js, css/admin.css)
public/images/       Product & hero photography
uploads/             Admin-uploaded product photos + payment screenshots (gitignored)
data/                SQLite database (gitignored)
```

## 🛡️ Security notes

- Passwords hashed with bcrypt
- HttpOnly session cookies; admin APIs gated behind an admin check
- Image-only uploads, 8 MB limit, randomized filenames
- Order totals recalculated from the database on the server
