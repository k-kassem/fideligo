const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;

  const raw = fs.readFileSync(filePath);
  let content;

  const isUtf16Le = raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe;
  const isUtf16Be = raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff;

  if (isUtf16Le || isUtf16Be) {
    // PowerShell can create UTF-16 files by default.
    content = raw.toString('utf16le');
  } else {
    content = raw.toString('utf8');
  }

  const parsed = dotenv.parse(content);
  for (const [key, value] of Object.entries(parsed)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.join(process.cwd(), 'smtp.env'));
loadEnvFile(path.join(process.cwd(), '.env'));

const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'loyality.db');

const MAIL_FROM = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@fidelite.local';

const INITIAL_ADMIN = {
  email: 'admin@fidelite.com',
  password: 'admin123',
  name: 'Administrateur'
};

function generateId() {
  return crypto.randomBytes(12).toString('hex');
}

function nowIso() {
  return new Date().toISOString();
}

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createMailTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS?.replace(/\s+/g, '');

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    auth: {
      user,
      pass
    }
  });
}

async function sendVerificationEmail(email, code) {
  const transporter = createMailTransporter();

  if (!transporter) {
    throw new Error('Configuration SMTP manquante (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS).');
  }

  await transporter.sendMail({
    from: MAIL_FROM,
    to: email,
    subject: 'Votre code de vérification Fidelité',
    text: `Bonjour,\n\nVotre code de vérification est : ${code}\n\nCe code expire dans 10 minutes.\n\nFidelité`,
    html: `
      <p>Bonjour,</p>
      <p>Votre code de vérification est :</p>
      <p style="font-size:24px;font-weight:bold;letter-spacing:2px">${code}</p>
      <p>Ce code expire dans <strong>10 minutes</strong>.</p>
      <p>Fidelité</p>
    `
  });
}

async function hashPassword(password) {
  const saltRounds = 10;
  return bcrypt.hash(password, saltRounds);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    password: row.password,
    role: row.role,
    name: row.name,
    isVerified: Number(row.is_verified ?? 1) === 1,
    createdAt: row.created_at
  };
}

function mapRestaurant(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    description: row.description,
    userId: row.user_id,
    pointsPerEuro: row.points_per_euro,
    subscriptionEndDate: row.subscription_end_date ?? undefined,
    createdAt: row.created_at
  };
}

function mapClient(row) {
  if (!row) return null;
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    region: row.region,
    userId: row.user_id,
    createdAt: row.created_at
  };
}

function mapPurchase(row) {
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    restaurantId: row.restaurant_id,
    amount: row.amount,
    pointsEarned: row.points_earned,
    pointsUsed: row.points_used,
    description: row.description,
    date: row.date
  };
}

function mapPointsBalance(row) {
  if (!row) return null;
  return {
    clientId: row.client_id,
    restaurantId: row.restaurant_id,
    points: row.points,
    updatedAt: row.updated_at
  };
}

async function initDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec('PRAGMA foreign_keys = ON');

  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'restaurant', 'client')),
      name TEXT NOT NULL,
      is_verified INTEGER NOT NULL DEFAULT 1 CHECK(is_verified IN (0, 1)),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS restaurants (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      description TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      points_per_euro REAL NOT NULL DEFAULT 1 CHECK(points_per_euro >= 0),
      subscription_end_date TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS clients (
      id TEXT PRIMARY KEY,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      phone TEXT NOT NULL,
      region TEXT NOT NULL,
      user_id TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount >= 0),
      points_earned INTEGER NOT NULL DEFAULT 0 CHECK(points_earned >= 0),
      points_used INTEGER NOT NULL DEFAULT 0 CHECK(points_used >= 0),
      description TEXT NOT NULL,
      date TEXT NOT NULL,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS points_balances (
      client_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0),
      updated_at TEXT NOT NULL,
      PRIMARY KEY(client_id, restaurant_id),
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS current_session (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      user_id TEXT,
      updated_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS healthcheck (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      client_id TEXT NOT NULL,
      restaurant_id TEXT NOT NULL,
      ticket_number TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      purchase_date TEXT NOT NULL,
      photo_url TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','APPROVED','REJECTED','POINTS_GRANTED')),
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(client_id) REFERENCES clients(id) ON DELETE CASCADE,
      FOREIGN KEY(restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
      UNIQUE(ticket_number, restaurant_id)
    );

    CREATE TABLE IF NOT EXISTS client_verification_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      verified_at TEXT,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurants(user_id);
    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_client_id ON purchases(client_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_restaurant_id ON purchases(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_points_balances_client_id ON points_balances(client_id);
    CREATE INDEX IF NOT EXISTS idx_points_balances_restaurant_id ON points_balances(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_client_verif_user_id ON client_verification_codes(user_id);
  `);

  const restaurantColumns = await db.all('PRAGMA table_info(restaurants)');
  const hasPointsPerEuro = restaurantColumns.some((column) => column.name === 'points_per_euro');
  if (!hasPointsPerEuro) {
    await db.exec('ALTER TABLE restaurants ADD COLUMN points_per_euro REAL NOT NULL DEFAULT 1');
  }

  const userColumns = await db.all('PRAGMA table_info(users)');
  const hasIsVerified = userColumns.some((column) => column.name === 'is_verified');
  if (!hasIsVerified) {
    await db.exec('ALTER TABLE users ADD COLUMN is_verified INTEGER NOT NULL DEFAULT 1');
  }

  const admin = await db.get('SELECT id FROM users WHERE email = ?', [INITIAL_ADMIN.email]);
  if (!admin) {
    const hashedPassword = await hashPassword(INITIAL_ADMIN.password);
    await db.run(
      'INSERT INTO users (id, email, password, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [generateId(), INITIAL_ADMIN.email, hashedPassword, 'admin', INITIAL_ADMIN.name, nowIso()]
    );
  }

  const session = await db.get('SELECT id FROM current_session WHERE id = 1');
  if (!session) {
    await db.run('INSERT INTO current_session (id, user_id, updated_at) VALUES (1, NULL, ?)', [nowIso()]);
  }

  return db;
}

function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

async function bootstrap() {
  const db = await initDb();
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use((_req, res, next) => {
    res.setHeader('Content-Type', 'application/json; charset=UTF-8');
    next();
  });

  app.get('/', (_req, res) => {
    res.json({
      name: 'Loyality API',
      status: 'running',
      health: '/api/health',
      frontend: 'http://localhost:4200'
    });
  });

  app.get('/api/health', asyncHandler(async (_req, res) => {
    await db.run('INSERT INTO healthcheck (created_at) VALUES (?)', [nowIso()]);
    res.json({ ok: true });
  }));

  app.post('/api/init', asyncHandler(async (_req, res) => {
    const admin = await db.get('SELECT id FROM users WHERE email = ?', [INITIAL_ADMIN.email]);
    if (!admin) {
      const hashedPassword = await hashPassword(INITIAL_ADMIN.password);
      await db.run(
        'INSERT INTO users (id, email, password, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        [generateId(), INITIAL_ADMIN.email, hashedPassword, 'admin', INITIAL_ADMIN.name, nowIso()]
      );
    }
    res.json({ ok: true });
  }));

  app.post('/api/login', asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    
    const user = await db.get('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
    
    if (!user) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    const isPasswordValid = await verifyPassword(password, user.password);
    
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
    }

    if (user.role === 'client' && Number(user.is_verified ?? 1) !== 1) {
      return res.status(403).json({ error: 'Compte non vérifié. Veuillez saisir le code reçu par email.' });
    }

    res.json(mapUser(user));
  }));

  app.post('/api/auth/register-client', asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, region, password } = req.body;

    if (!firstName || !lastName || !email || !phone || !region || !password) {
      return res.status(400).json({ error: 'Données d\'inscription incomplètes' });
    }

    const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const userId = generateId();
    const clientId = generateId();
    const createdAt = nowIso();
    const hashedPassword = await hashPassword(password);
    const code = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.exec('BEGIN TRANSACTION');
    try {
      await db.run(
        'INSERT INTO users (id, email, password, role, name, is_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [userId, email, hashedPassword, 'client', `${firstName} ${lastName}`.trim(), 0, createdAt]
      );

      await db.run(
        `INSERT INTO clients (id, first_name, last_name, email, phone, region, user_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [clientId, firstName, lastName, email, phone, region, userId, createdAt]
      );

      await db.run('DELETE FROM client_verification_codes WHERE user_id = ? AND verified_at IS NULL', [userId]);
      await db.run(
        `INSERT INTO client_verification_codes (id, user_id, code, expires_at, created_at, verified_at)
         VALUES (?, ?, ?, ?, ?, NULL)`,
        [generateId(), userId, code, expiresAt, createdAt]
      );

      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }

    try {
      await sendVerificationEmail(email, code);
    } catch (error) {
      console.error(`[MAIL] Échec d'envoi du code de vérification à ${email}:`, error.message);
      return res.status(500).json({
        error: "Compte créé, mais l'envoi de l'email a échoué. Vérifiez la configuration SMTP puis cliquez sur 'Renvoyer le code'."
      });
    }

    res.status(201).json({
      ok: true,
      email,
      message: 'Compte créé. Un code de vérification a été envoyé par email.'
    });
  }));

  app.post('/api/auth/verify-client', asyncHandler(async (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ error: 'Email et code requis' });
    }

    const user = await db.get(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = ? LIMIT 1',
      [email, 'client']
    );

    if (!user) {
      return res.status(404).json({ error: 'Compte client introuvable' });
    }

    const entry = await db.get(
      `SELECT * FROM client_verification_codes
       WHERE user_id = ? AND code = ? AND verified_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id, String(code).trim()]
    );

    if (!entry) {
      return res.status(400).json({ error: 'Code invalide' });
    }

    if (new Date(entry.expires_at).getTime() < Date.now()) {
      return res.status(400).json({ error: 'Code expiré. Veuillez demander un nouveau code.' });
    }

    const verifiedAt = nowIso();
    await db.exec('BEGIN TRANSACTION');
    try {
      await db.run('UPDATE users SET is_verified = 1 WHERE id = ?', [user.id]);
      await db.run('UPDATE client_verification_codes SET verified_at = ? WHERE id = ?', [verifiedAt, entry.id]);
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }

    res.json({ ok: true, message: 'Compte vérifié avec succès. Vous pouvez vous connecter.' });
  }));

  app.post('/api/auth/resend-client-code', asyncHandler(async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requis' });
    }

    const user = await db.get(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?) AND role = ? LIMIT 1',
      [email, 'client']
    );

    if (!user) {
      return res.status(404).json({ error: 'Compte client introuvable' });
    }

    if (Number(user.is_verified ?? 1) === 1) {
      return res.status(400).json({ error: 'Ce compte est déjà vérifié' });
    }

    const code = generateVerificationCode();
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await db.run('DELETE FROM client_verification_codes WHERE user_id = ? AND verified_at IS NULL', [user.id]);
    await db.run(
      `INSERT INTO client_verification_codes (id, user_id, code, expires_at, created_at, verified_at)
       VALUES (?, ?, ?, ?, ?, NULL)`,
      [generateId(), user.id, code, expiresAt, createdAt]
    );

    try {
      await sendVerificationEmail(email, code);
    } catch (error) {
      console.error(`[MAIL] Échec de renvoi du code à ${email}:`, error.message);
      return res.status(500).json({
        error: "Impossible d'envoyer l'email. Vérifiez la configuration SMTP."
      });
    }

    res.json({
      ok: true,
      message: 'Un nouveau code a été envoyé par email.'
    });
  }));

  app.get('/api/users', asyncHandler(async (_req, res) => {
    const rows = await db.all('SELECT * FROM users ORDER BY created_at ASC');
    res.json(rows.map(mapUser));
  }));

  app.get('/api/users/by-email/:email', asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const row = await db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1', [email]);
    res.json(mapUser(row));
  }));

  app.get('/api/users/:id', asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapUser(row));
  }));

  app.post('/api/users', asyncHandler(async (req, res) => {
    const { email, password, role, name } = req.body;
    const hashedPassword = await hashPassword(password);
    const user = {
      id: generateId(),
      email,
      password: hashedPassword,
      role,
      name,
      createdAt: nowIso()
    };

    await db.run(
      'INSERT INTO users (id, email, password, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      [user.id, user.email, user.password, user.role, user.name, user.createdAt]
    );

    res.status(201).json(user);
  }));

  app.patch('/api/users/:id', asyncHandler(async (req, res) => {
    const { email, password, role, name } = req.body;
    const updates = [];
    const params = [];

    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (password !== undefined) { updates.push('password = ?'); params.push(password); }
    if (role !== undefined) { updates.push('role = ?'); params.push(role); }
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }

    if (updates.length > 0) {
      await db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    }

    const updated = await db.get('SELECT * FROM users WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapUser(updated));
  }));

  app.get('/api/restaurants', asyncHandler(async (_req, res) => {
    const rows = await db.all('SELECT * FROM restaurants ORDER BY created_at ASC');
    res.json(rows.map(mapRestaurant));
  }));

  app.get('/api/restaurants/by-user/:userId', asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM restaurants WHERE user_id = ? LIMIT 1', [req.params.userId]);
    res.json(mapRestaurant(row));
  }));

  app.get('/api/restaurants/:id', asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM restaurants WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapRestaurant(row));
  }));

  app.post('/api/restaurants', asyncHandler(async (req, res) => {
    const payload = req.body;
    const restaurant = {
      id: generateId(),
      ...payload,
      pointsPerEuro: Number(payload.pointsPerEuro ?? 1),
      createdAt: nowIso()
    };

    await db.run(
      `INSERT INTO restaurants (id, name, email, phone, address, description, user_id, points_per_euro, subscription_end_date, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [restaurant.id, restaurant.name, restaurant.email, restaurant.phone, restaurant.address, restaurant.description, restaurant.userId, restaurant.pointsPerEuro, restaurant.subscriptionEndDate ?? null, restaurant.createdAt]
    );

    res.status(201).json(restaurant);
  }));

  app.patch('/api/restaurants/:id', asyncHandler(async (req, res) => {
    const { name, email, phone, address, description, pointsPerEuro, subscriptionEndDate } = req.body;
    const updates = [];
    const params = [];

    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (pointsPerEuro !== undefined) { updates.push('points_per_euro = ?'); params.push(Number(pointsPerEuro)); }
    if (subscriptionEndDate !== undefined) { updates.push('subscription_end_date = ?'); params.push(subscriptionEndDate ?? null); }

    if (updates.length > 0) {
      await db.run(`UPDATE restaurants SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    }

    const updated = await db.get('SELECT * FROM restaurants WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapRestaurant(updated));
  }));

  app.delete('/api/restaurants/:id', asyncHandler(async (req, res) => {
    await db.run('DELETE FROM restaurants WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  }));

  app.get('/api/clients', asyncHandler(async (_req, res) => {
    const rows = await db.all('SELECT * FROM clients ORDER BY created_at ASC');
    res.json(rows.map(mapClient));
  }));

  app.get('/api/clients/by-user/:userId', asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM clients WHERE user_id = ? LIMIT 1', [req.params.userId]);
    res.json(mapClient(row));
  }));

  app.get('/api/clients/by-email/:email', asyncHandler(async (req, res) => {
    const email = decodeURIComponent(req.params.email);
    const row = await db.get('SELECT * FROM clients WHERE email = ? LIMIT 1', [email]);
    res.json(mapClient(row));
  }));

  app.get('/api/clients/:id', asyncHandler(async (req, res) => {
    const row = await db.get('SELECT * FROM clients WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapClient(row));
  }));

  app.post('/api/clients', asyncHandler(async (req, res) => {
    const payload = req.body;
    const client = { id: generateId(), ...payload, createdAt: nowIso() };

    await db.run(
      `INSERT INTO clients (id, first_name, last_name, email, phone, region, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [client.id, client.firstName, client.lastName, client.email, client.phone, client.region, client.userId, client.createdAt]
    );

    res.status(201).json(client);
  }));

  app.patch('/api/clients/:id', asyncHandler(async (req, res) => {
    const { firstName, lastName, email, phone, region, userId } = req.body;
    const updates = [];
    const params = [];

    if (firstName !== undefined) { updates.push('first_name = ?'); params.push(firstName); }
    if (lastName !== undefined) { updates.push('last_name = ?'); params.push(lastName); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (region !== undefined) { updates.push('region = ?'); params.push(region); }
    if (userId !== undefined) { updates.push('user_id = ?'); params.push(userId); }

    if (updates.length > 0) {
      await db.run(`UPDATE clients SET ${updates.join(', ')} WHERE id = ?`, [...params, req.params.id]);
    }

    const updated = await db.get('SELECT * FROM clients WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapClient(updated));
  }));

  app.delete('/api/clients/:id', asyncHandler(async (req, res) => {
    const client = await db.get('SELECT * FROM clients WHERE id = ? LIMIT 1', [req.params.id]);
    await db.run('DELETE FROM clients WHERE id = ?', [req.params.id]);
    if (client && client.user_id) {
      await db.run('DELETE FROM users WHERE id = ?', [client.user_id]);
    }
    res.json({ ok: true });
  }));

  // ── Tickets ──────────────────────────────────────────────────────────
  const mapTicket = (t) => t ? {
    id: t.id,
    clientId: t.client_id,
    restaurantId: t.restaurant_id,
    ticketNumber: t.ticket_number,
    amount: t.amount,
    purchaseDate: t.purchase_date,
    photoUrl: t.photo_url ?? null,
    status: t.status,
    rejectionReason: t.rejection_reason ?? null,
    createdAt: t.created_at
  } : null;

  app.post('/api/tickets', asyncHandler(async (req, res) => {
    const { clientId, restaurantId, ticketNumber, amount, purchaseDate, photoUrl } = req.body;
    if (!clientId || !restaurantId || !ticketNumber || !amount || !purchaseDate) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }
    const existing = await db.get(
      'SELECT id FROM tickets WHERE ticket_number = ? AND restaurant_id = ? LIMIT 1',
      [ticketNumber, restaurantId]
    );
    if (existing) {
      return res.status(409).json({ error: 'Ce ticket a déjà été soumis pour ce restaurant' });
    }
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO tickets (id, client_id, restaurant_id, ticket_number, amount, purchase_date, photo_url, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, \'PENDING\', ?)',
      [id, clientId, restaurantId, ticketNumber, amount, purchaseDate, photoUrl ?? null, now]
    );
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ? LIMIT 1', [id]);
    res.status(201).json(mapTicket(ticket));
  }));

  app.get('/api/tickets', asyncHandler(async (req, res) => {
    const { clientId, restaurantId, status } = req.query;
    let sql = 'SELECT * FROM tickets WHERE 1=1';
    const params = [];
    if (clientId) { sql += ' AND client_id = ?'; params.push(clientId); }
    if (restaurantId) { sql += ' AND restaurant_id = ?'; params.push(restaurantId); }
    if (status) { sql += ' AND status = ?'; params.push(status); }
    sql += ' ORDER BY created_at DESC';
    const rows = await db.all(sql, params);
    res.json(rows.map(mapTicket));
  }));

  app.patch('/api/tickets/:id/approve', asyncHandler(async (req, res) => {
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ? LIMIT 1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    if (ticket.status !== 'PENDING') return res.status(400).json({ error: 'Ticket déjà traité' });
    const restaurant = await db.get('SELECT * FROM restaurants WHERE id = ? LIMIT 1', [ticket.restaurant_id]);
    const pointsEarned = Math.floor(ticket.amount * (restaurant?.points_per_euro ?? 1));
    const purchaseId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.run(
      'INSERT INTO purchases (id, client_id, restaurant_id, amount, points_earned, points_used, description, date) VALUES (?, ?, ?, ?, ?, 0, ?, ?)',
      [purchaseId, ticket.client_id, ticket.restaurant_id, ticket.amount, pointsEarned, `Ticket #${ticket.ticket_number}`, ticket.purchase_date]
    );
    const balance = await db.get(
      'SELECT * FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1',
      [ticket.client_id, ticket.restaurant_id]
    );
    if (balance) {
      await db.run(
        'UPDATE points_balances SET points = points + ?, updated_at = ? WHERE client_id = ? AND restaurant_id = ?',
        [pointsEarned, now, ticket.client_id, ticket.restaurant_id]
      );
    } else {
      await db.run(
        'INSERT INTO points_balances (client_id, restaurant_id, points, updated_at) VALUES (?, ?, ?, ?)',
        [ticket.client_id, ticket.restaurant_id, pointsEarned, now]
      );
    }
    await db.run('UPDATE tickets SET status = \'POINTS_GRANTED\' WHERE id = ?', [req.params.id]);
    const updated = await db.get('SELECT * FROM tickets WHERE id = ? LIMIT 1', [req.params.id]);
    res.json({ ticket: mapTicket(updated), pointsEarned });
  }));

  app.patch('/api/tickets/:id/reject', asyncHandler(async (req, res) => {
    const ticket = await db.get('SELECT * FROM tickets WHERE id = ? LIMIT 1', [req.params.id]);
    if (!ticket) return res.status(404).json({ error: 'Ticket introuvable' });
    if (ticket.status !== 'PENDING') return res.status(400).json({ error: 'Ticket déjà traité' });
    const { reason } = req.body;
    await db.run('UPDATE tickets SET status = \'REJECTED\', rejection_reason = ? WHERE id = ?', [reason ?? null, req.params.id]);
    const updated = await db.get('SELECT * FROM tickets WHERE id = ? LIMIT 1', [req.params.id]);
    res.json(mapTicket(updated));
  }));

  app.get('/api/purchases', asyncHandler(async (req, res) => {
    const { clientId, restaurantId } = req.query;
    let sql = 'SELECT * FROM purchases';
    const params = [];

    if (clientId && restaurantId) {
      sql += ' WHERE client_id = ? AND restaurant_id = ?';
      params.push(clientId, restaurantId);
    } else if (clientId) {
      sql += ' WHERE client_id = ?';
      params.push(clientId);
    } else if (restaurantId) {
      sql += ' WHERE restaurant_id = ?';
      params.push(restaurantId);
    }

    sql += ' ORDER BY date DESC';

    const rows = await db.all(sql, params);
    res.json(rows.map(mapPurchase));
  }));

  app.post('/api/purchases', asyncHandler(async (req, res) => {
    const payload = req.body;
    const amount = Number(payload.amount);
    const pointsUsed = Math.max(0, Math.floor(Number(payload.pointsUsed ?? 0)));
    const bonusPoints = Math.max(0, Math.floor(Number(payload.bonusPoints ?? 0)));

    if (!payload.clientId || !payload.restaurantId || Number.isNaN(amount) || amount < 0) {
      return res.status(400).json({ error: 'Données d\'achat invalides' });
    }

    const restaurant = await db.get('SELECT points_per_euro FROM restaurants WHERE id = ? LIMIT 1', [payload.restaurantId]);
    if (!restaurant) {
      return res.status(404).json({ error: 'Restaurant introuvable' });
    }

    const pointsPerEuro = Number(restaurant.points_per_euro ?? 1);
    const basePoints = Math.floor(amount * pointsPerEuro);
    const pointsEarned = basePoints + bonusPoints;

    const existing = await db.get(
      'SELECT points FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1',
      [payload.clientId, payload.restaurantId]
    );
    const currentBalance = Number(existing?.points ?? 0);

    if (pointsUsed > currentBalance) {
      return res.status(400).json({ error: `Points insuffisants: solde actuel ${currentBalance}` });
    }

    const purchase = {
      id: generateId(),
      clientId: payload.clientId,
      restaurantId: payload.restaurantId,
      amount,
      pointsEarned,
      pointsUsed,
      description: payload.description ?? '',
      date: nowIso()
    };

    await db.run(
      `INSERT INTO purchases (id, client_id, restaurant_id, amount, points_earned, points_used, description, date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [purchase.id, purchase.clientId, purchase.restaurantId, purchase.amount, purchase.pointsEarned, purchase.pointsUsed, purchase.description, purchase.date]
    );

    // Mise à jour du solde de points : ajout des points gagnés, retrait des points utilisés
    const netDelta = purchase.pointsEarned - purchase.pointsUsed;
    const now = nowIso();
    if (existing) {
      const nextPoints = Math.max(0, currentBalance + netDelta);
      await db.run(
        'UPDATE points_balances SET points = ?, updated_at = ? WHERE client_id = ? AND restaurant_id = ?',
        [nextPoints, now, purchase.clientId, purchase.restaurantId]
      );
    } else {
      await db.run(
        'INSERT INTO points_balances (client_id, restaurant_id, points, updated_at) VALUES (?, ?, ?, ?)',
        [purchase.clientId, purchase.restaurantId, Math.max(0, netDelta), now]
      );
    }

    res.status(201).json(purchase);
  }));

  app.get('/api/points/balance', asyncHandler(async (req, res) => {
    const { clientId, restaurantId } = req.query;
    const row = await db.get(
      'SELECT * FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1',
      [clientId, restaurantId]
    );
    res.json(mapPointsBalance(row));
  }));

  app.post('/api/points/update', asyncHandler(async (req, res) => {
    const { clientId, restaurantId, pointsDelta } = req.body;
    const row = await db.get(
      'SELECT points FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1',
      [clientId, restaurantId]
    );

    const now = nowIso();

    if (row) {
      const nextPoints = Math.max(0, row.points + Number(pointsDelta));
      await db.run(
        'UPDATE points_balances SET points = ?, updated_at = ? WHERE client_id = ? AND restaurant_id = ?',
        [nextPoints, now, clientId, restaurantId]
      );
    } else {
      const nextPoints = Math.max(0, Number(pointsDelta));
      await db.run(
        'INSERT INTO points_balances (client_id, restaurant_id, points, updated_at) VALUES (?, ?, ?, ?)',
        [clientId, restaurantId, nextPoints, now]
      );
    }

    const updated = await db.get(
      'SELECT * FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1',
      [clientId, restaurantId]
    );

    res.json(mapPointsBalance(updated));
  }));

  app.get('/api/points/client/:clientId', asyncHandler(async (req, res) => {
    const rows = await db.all(
      `SELECT r.*, pb.points
       FROM points_balances pb
       INNER JOIN restaurants r ON r.id = pb.restaurant_id
       WHERE pb.client_id = ?`,
      [req.params.clientId]
    );

    res.json(rows.map((row) => ({
      restaurant: mapRestaurant(row),
      points: row.points
    })));
  }));

  app.get('/api/session/current', asyncHandler(async (_req, res) => {
    const row = await db.get(
      `SELECT u.*
       FROM current_session s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = 1
       LIMIT 1`
    );

    res.json(mapUser(row));
  }));

  app.put('/api/session/current', asyncHandler(async (req, res) => {
    const { userId } = req.body;
    await db.run(
      `INSERT INTO current_session (id, user_id, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`,
      [userId ?? null, nowIso()]
    );

    res.json({ ok: true });
  }));

  app.post('/api/reset', asyncHandler(async (_req, res) => {
    await db.exec('BEGIN TRANSACTION');
    try {
      await db.run('DELETE FROM purchases');
      await db.run('DELETE FROM points_balances');
      await db.run('DELETE FROM restaurants');
      await db.run('DELETE FROM clients');
      await db.run('DELETE FROM current_session');
      await db.run("DELETE FROM users WHERE role != 'admin'");
      await db.run('INSERT INTO current_session (id, user_id, updated_at) VALUES (1, NULL, ?) ON CONFLICT(id) DO UPDATE SET user_id = NULL, updated_at = excluded.updated_at', [nowIso()]);
      await db.exec('COMMIT');
    } catch (error) {
      await db.exec('ROLLBACK');
      throw error;
    }

    res.json({ ok: true });
  }));

  app.use((error, _req, res, _next) => {
    res.status(500).json({ error: error.message || 'Internal server error' });
  });

  app.listen(PORT, () => {
    console.log(`API server running on http://localhost:${PORT}`);
  });
}

bootstrap().catch((error) => {
  console.error('Failed to start API server:', error);
  process.exit(1);
});
