const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const bcrypt = require('bcryptjs');

const PORT = process.env.PORT || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'loyality.db');

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

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_restaurants_user_id ON restaurants(user_id);
    CREATE INDEX IF NOT EXISTS idx_clients_user_id ON clients(user_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_client_id ON purchases(client_id);
    CREATE INDEX IF NOT EXISTS idx_purchases_restaurant_id ON purchases(restaurant_id);
    CREATE INDEX IF NOT EXISTS idx_points_balances_client_id ON points_balances(client_id);
    CREATE INDEX IF NOT EXISTS idx_points_balances_restaurant_id ON points_balances(restaurant_id);
  `);

  const restaurantColumns = await db.all('PRAGMA table_info(restaurants)');
  const hasPointsPerEuro = restaurantColumns.some((column) => column.name === 'points_per_euro');
  if (!hasPointsPerEuro) {
    await db.exec('ALTER TABLE restaurants ADD COLUMN points_per_euro REAL NOT NULL DEFAULT 1');
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

    res.json(mapUser(user));
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
    await db.run('DELETE FROM clients WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
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
