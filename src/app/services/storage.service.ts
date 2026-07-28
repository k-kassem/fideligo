import { Injectable } from '@angular/core';
import type { User, Restaurant, Client, Purchase, PointsBalance } from '../types';
import { INITIAL_ADMIN } from '../types';
import { SqliteService } from './sqlite.service';

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  constructor(private sqliteService: SqliteService) {}

  // Initialisation des données
  async initializeData(): Promise<void> {
    await this.sqliteService.initialize();

    const admin = this.findUserByEmail(INITIAL_ADMIN.email);
    if (!admin) {
      this.addUser({
        email: INITIAL_ADMIN.email,
        password: INITIAL_ADMIN.password,
        role: 'admin',
        name: INITIAL_ADMIN.name
      });
    }
  }

  // Utilitaires
  private generateId() {
    return Math.random().toString(36).substring(2, 15);
  }

  // Users
  getUsers(): User[] {
    return this.sqliteService.query<User>(`
      SELECT id, email, password, role, name, created_at AS createdAt
      FROM users
      ORDER BY created_at ASC
    `);
  }

  saveUsers(users: User[]) {
    this.sqliteService.transaction(() => {
      this.sqliteService.run('DELETE FROM users');
      users.forEach((user) => {
        this.sqliteService.run(
          `INSERT INTO users (id, email, password, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
          [user.id, user.email, user.password, user.role, user.name, user.createdAt]
        );
      });
    });
  }

  addUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const users = this.getUsers();
    const newUser: User = {
      ...user,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };

    this.sqliteService.run(
      `INSERT INTO users (id, email, password, role, name, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [newUser.id, newUser.email, newUser.password, newUser.role, newUser.name, newUser.createdAt]
    );

    return newUser;
  }

  findUserByEmail(email: string): User | undefined {
    const user = this.sqliteService.queryOne<User>(
      `SELECT id, email, password, role, name, created_at AS createdAt
       FROM users
       WHERE lower(email) = lower(?)
       LIMIT 1`,
      [email]
    );

    return user ?? undefined;
  }

  findUserById(id: string): User | undefined {
    const user = this.sqliteService.queryOne<User>(
      `SELECT id, email, password, role, name, created_at AS createdAt
       FROM users
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return user ?? undefined;
  }

  // Restaurants
  getRestaurants(): Restaurant[] {
    return this.sqliteService.query<Restaurant>(`
      SELECT
        id,
        name,
        email,
        phone,
        address,
        description,
        user_id AS userId,
        subscription_end_date AS subscriptionEndDate,
        created_at AS createdAt
      FROM restaurants
      ORDER BY created_at ASC
    `);
  }

  saveRestaurants(restaurants: Restaurant[]) {
    this.sqliteService.transaction(() => {
      this.sqliteService.run('DELETE FROM restaurants');
      restaurants.forEach((restaurant) => {
        this.sqliteService.run(
          `INSERT INTO restaurants (
            id, name, email, phone, address, description, user_id, subscription_end_date, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            restaurant.id,
            restaurant.name,
            restaurant.email,
            restaurant.phone,
            restaurant.address,
            restaurant.description,
            restaurant.userId,
            restaurant.subscriptionEndDate ?? null,
            restaurant.createdAt
          ]
        );
      });
    });
  }

  addRestaurant(restaurant: Omit<Restaurant, 'id' | 'createdAt'>): Restaurant {
    const restaurants = this.getRestaurants();
    const newRestaurant: Restaurant = {
      ...restaurant,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };

    this.sqliteService.run(
      `INSERT INTO restaurants (
        id, name, email, phone, address, description, user_id, subscription_end_date, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newRestaurant.id,
        newRestaurant.name,
        newRestaurant.email,
        newRestaurant.phone,
        newRestaurant.address,
        newRestaurant.description,
        newRestaurant.userId,
        newRestaurant.subscriptionEndDate ?? null,
        newRestaurant.createdAt
      ]
    );

    return newRestaurant;
  }

  findRestaurantByUserId(userId: string): Restaurant | undefined {
    const restaurant = this.sqliteService.queryOne<Restaurant>(
      `SELECT
         id,
         name,
         email,
         phone,
         address,
         description,
         user_id AS userId,
         subscription_end_date AS subscriptionEndDate,
         created_at AS createdAt
       FROM restaurants
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    return restaurant ?? undefined;
  }

  findRestaurantById(id: string): Restaurant | undefined {
    const restaurant = this.sqliteService.queryOne<Restaurant>(
      `SELECT
         id,
         name,
         email,
         phone,
         address,
         description,
         user_id AS userId,
         subscription_end_date AS subscriptionEndDate,
         created_at AS createdAt
       FROM restaurants
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return restaurant ?? undefined;
  }

  deleteRestaurant(id: string) {
    this.sqliteService.run('DELETE FROM restaurants WHERE id = ?', [id]);
  }

  updateRestaurant(id: string, updates: Partial<Omit<Restaurant, 'id' | 'createdAt'>>): Restaurant | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      params.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      params.push(updates.phone);
    }
    if (updates.address !== undefined) {
      fields.push('address = ?');
      params.push(updates.address);
    }
    if (updates.description !== undefined) {
      fields.push('description = ?');
      params.push(updates.description);
    }
    if ('subscriptionEndDate' in updates) {
      fields.push('subscription_end_date = ?');
      params.push(updates.subscriptionEndDate ?? null);
    }

    if (fields.length === 0) {
      return this.findRestaurantById(id) ?? null;
    }

    this.sqliteService.run(`UPDATE restaurants SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
    return this.findRestaurantById(id) ?? null;
  }

  updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): User | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.email !== undefined) {
      fields.push('email = ?');
      params.push(updates.email);
    }
    if (updates.password !== undefined) {
      fields.push('password = ?');
      params.push(updates.password);
    }
    if (updates.role !== undefined) {
      fields.push('role = ?');
      params.push(updates.role);
    }
    if (updates.name !== undefined) {
      fields.push('name = ?');
      params.push(updates.name);
    }

    if (fields.length === 0) {
      return this.findUserById(id) ?? null;
    }

    this.sqliteService.run(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
    return this.findUserById(id) ?? null;
  }

  updateClient(id: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Client | null {
    const fields: string[] = [];
    const params: any[] = [];

    if (updates.firstName !== undefined) {
      fields.push('first_name = ?');
      params.push(updates.firstName);
    }
    if (updates.lastName !== undefined) {
      fields.push('last_name = ?');
      params.push(updates.lastName);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      params.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      params.push(updates.phone);
    }
    if (updates.region !== undefined) {
      fields.push('region = ?');
      params.push(updates.region);
    }
    if (updates.userId !== undefined) {
      fields.push('user_id = ?');
      params.push(updates.userId);
    }

    if (fields.length === 0) {
      return this.findClientById(id) ?? null;
    }

    this.sqliteService.run(`UPDATE clients SET ${fields.join(', ')} WHERE id = ?`, [...params, id]);
    return this.findClientById(id) ?? null;
  }

  // Clients
  getClients(): Client[] {
    return this.sqliteService.query<Client>(`
      SELECT
        id,
        first_name AS firstName,
        last_name AS lastName,
        email,
        phone,
        region,
        user_id AS userId,
        created_at AS createdAt
      FROM clients
      ORDER BY created_at ASC
    `);
  }

  saveClients(clients: Client[]) {
    this.sqliteService.transaction(() => {
      this.sqliteService.run('DELETE FROM clients');
      clients.forEach((client) => {
        this.sqliteService.run(
          `INSERT INTO clients (
            id, first_name, last_name, email, phone, region, user_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            client.id,
            client.firstName,
            client.lastName,
            client.email,
            client.phone,
            client.region,
            client.userId,
            client.createdAt
          ]
        );
      });
    });
  }

  addClient(client: Omit<Client, 'id' | 'createdAt'>): Client {
    const clients = this.getClients();
    const newClient: Client = {
      ...client,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };

    this.sqliteService.run(
      `INSERT INTO clients (
        id, first_name, last_name, email, phone, region, user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newClient.id,
        newClient.firstName,
        newClient.lastName,
        newClient.email,
        newClient.phone,
        newClient.region,
        newClient.userId,
        newClient.createdAt
      ]
    );

    return newClient;
  }

  findClientByUserId(userId: string): Client | undefined {
    const client = this.sqliteService.queryOne<Client>(
      `SELECT
         id,
         first_name AS firstName,
         last_name AS lastName,
         email,
         phone,
         region,
         user_id AS userId,
         created_at AS createdAt
       FROM clients
       WHERE user_id = ?
       LIMIT 1`,
      [userId]
    );

    return client ?? undefined;
  }

  findClientById(id: string): Client | undefined {
    const client = this.sqliteService.queryOne<Client>(
      `SELECT
         id,
         first_name AS firstName,
         last_name AS lastName,
         email,
         phone,
         region,
         user_id AS userId,
         created_at AS createdAt
       FROM clients
       WHERE id = ?
       LIMIT 1`,
      [id]
    );

    return client ?? undefined;
  }

  findClientByEmail(email: string): Client | undefined {
    const client = this.sqliteService.queryOne<Client>(
      `SELECT
         id,
         first_name AS firstName,
         last_name AS lastName,
         email,
         phone,
         region,
         user_id AS userId,
         created_at AS createdAt
       FROM clients
       WHERE lower(email) = lower(?)
       LIMIT 1`,
      [email]
    );

    return client ?? undefined;
  }

  getAllClients(): Client[] {
    return this.getClients();
  }

  // Purchases
  getPurchases(): Purchase[] {
    return this.sqliteService.query<Purchase>(`
      SELECT
        id,
        client_id AS clientId,
        restaurant_id AS restaurantId,
        amount,
        points_earned AS pointsEarned,
        points_used AS pointsUsed,
        description,
        date
      FROM purchases
      ORDER BY date DESC
    `);
  }

  savePurchases(purchases: Purchase[]) {
    this.sqliteService.transaction(() => {
      this.sqliteService.run('DELETE FROM purchases');
      purchases.forEach((purchase) => {
        this.sqliteService.run(
          `INSERT INTO purchases (
            id, client_id, restaurant_id, amount, points_earned, points_used, description, date
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            purchase.id,
            purchase.clientId,
            purchase.restaurantId,
            purchase.amount,
            purchase.pointsEarned,
            purchase.pointsUsed,
            purchase.description,
            purchase.date
          ]
        );
      });
    });
  }

  addPurchase(purchase: Omit<Purchase, 'id' | 'date'>): Purchase {
    const purchases = this.getPurchases();
    const newPurchase: Purchase = {
      ...purchase,
      id: this.generateId(),
      date: new Date().toISOString()
    };

    this.sqliteService.run(
      `INSERT INTO purchases (
        id, client_id, restaurant_id, amount, points_earned, points_used, description, date
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newPurchase.id,
        newPurchase.clientId,
        newPurchase.restaurantId,
        newPurchase.amount,
        newPurchase.pointsEarned,
        newPurchase.pointsUsed,
        newPurchase.description,
        newPurchase.date
      ]
    );

    return newPurchase;
  }

  getPurchasesByClient(clientId: string): Purchase[] {
    return this.sqliteService.query<Purchase>(
      `SELECT
         id,
         client_id AS clientId,
         restaurant_id AS restaurantId,
         amount,
         points_earned AS pointsEarned,
         points_used AS pointsUsed,
         description,
         date
       FROM purchases
       WHERE client_id = ?
       ORDER BY date DESC`,
      [clientId]
    );
  }

  getPurchasesByRestaurant(restaurantId: string): Purchase[] {
    return this.sqliteService.query<Purchase>(
      `SELECT
         id,
         client_id AS clientId,
         restaurant_id AS restaurantId,
         amount,
         points_earned AS pointsEarned,
         points_used AS pointsUsed,
         description,
         date
       FROM purchases
       WHERE restaurant_id = ?
       ORDER BY date DESC`,
      [restaurantId]
    );
  }

  getPurchasesByClientAndRestaurant(clientId: string, restaurantId: string): Purchase[] {
    return this.sqliteService.query<Purchase>(
      `SELECT
         id,
         client_id AS clientId,
         restaurant_id AS restaurantId,
         amount,
         points_earned AS pointsEarned,
         points_used AS pointsUsed,
         description,
         date
       FROM purchases
       WHERE client_id = ? AND restaurant_id = ?
       ORDER BY date DESC`,
      [clientId, restaurantId]
    );
  }

  // Points Balance
  getPointsBalances(): PointsBalance[] {
    return this.sqliteService.query<PointsBalance>(`
      SELECT
        client_id AS clientId,
        restaurant_id AS restaurantId,
        points,
        updated_at AS updatedAt
      FROM points_balances
    `);
  }

  savePointsBalances(balances: PointsBalance[]) {
    this.sqliteService.transaction(() => {
      this.sqliteService.run('DELETE FROM points_balances');
      balances.forEach((balance) => {
        this.sqliteService.run(
          `INSERT INTO points_balances (client_id, restaurant_id, points, updated_at) VALUES (?, ?, ?, ?)`,
          [balance.clientId, balance.restaurantId, balance.points, balance.updatedAt]
        );
      });
    });
  }

  getPointsBalance(clientId: string, restaurantId: string): number {
    const row = this.sqliteService.queryOne<{ points: number }>(
      `SELECT points FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1`,
      [clientId, restaurantId]
    );

    return row?.points ?? 0;
  }

  updatePointsBalance(clientId: string, restaurantId: string, pointsDelta: number): PointsBalance {
    const now = new Date().toISOString();

    return this.sqliteService.transaction(() => {
      const existing = this.sqliteService.queryOne<{ points: number }>(
        `SELECT points FROM points_balances WHERE client_id = ? AND restaurant_id = ? LIMIT 1`,
        [clientId, restaurantId]
      );

      if (existing) {
        const nextPoints = Math.max(0, existing.points + pointsDelta);
        this.sqliteService.run(
          `UPDATE points_balances SET points = ?, updated_at = ? WHERE client_id = ? AND restaurant_id = ?`,
          [nextPoints, now, clientId, restaurantId]
        );
      } else {
        this.sqliteService.run(
          `INSERT INTO points_balances (client_id, restaurant_id, points, updated_at) VALUES (?, ?, ?, ?)`,
          [clientId, restaurantId, Math.max(0, pointsDelta), now]
        );
      }

      return {
        clientId,
        restaurantId,
        points: this.getPointsBalance(clientId, restaurantId),
        updatedAt: now
      };
    });
  }

  getAllPointsForClient(clientId: string): { restaurant: Restaurant; points: number }[] {
    const rows = this.sqliteService.query<(Restaurant & { points: number })>(
      `SELECT
         r.id,
         r.name,
         r.email,
         r.phone,
         r.address,
         r.description,
         r.user_id AS userId,
         r.subscription_end_date AS subscriptionEndDate,
         r.created_at AS createdAt,
         pb.points AS points
       FROM points_balances pb
       INNER JOIN restaurants r ON r.id = pb.restaurant_id
       WHERE pb.client_id = ?`,
      [clientId]
    );

    return rows.map((row) => ({
      restaurant: {
        id: row.id,
        name: row.name,
        email: row.email,
        phone: row.phone,
        address: row.address,
        description: row.description,
        userId: row.userId,
        subscriptionEndDate: row.subscriptionEndDate,
        createdAt: row.createdAt
      },
      points: row.points
    }));
  }

  // Session
  getCurrentUser(): User | null {
    const user = this.sqliteService.queryOne<User>(
      `SELECT
         u.id,
         u.email,
         u.password,
         u.role,
         u.name,
         u.created_at AS createdAt
       FROM current_session s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.id = 1
       LIMIT 1`
    );

    return user ?? null;
  }

  setCurrentUser(user: User | null) {
    const now = new Date().toISOString();
    this.sqliteService.run(
      `INSERT INTO current_session (id, user_id, updated_at)
       VALUES (1, ?, ?)
       ON CONFLICT(id) DO UPDATE SET user_id = excluded.user_id, updated_at = excluded.updated_at`,
      [user?.id ?? null, now]
    );
  }

  // Reset all data (pour les tests)
  async resetAllData(): Promise<void> {
    await this.initializeData();

    this.sqliteService.transaction(() => {
      this.sqliteService.run('DELETE FROM purchases');
      this.sqliteService.run('DELETE FROM points_balances');
      this.sqliteService.run('DELETE FROM restaurants');
      this.sqliteService.run('DELETE FROM clients');
      this.sqliteService.run('DELETE FROM current_session');
      this.sqliteService.run('DELETE FROM users');
      this.sqliteService.run('DELETE FROM healthcheck');
    });

    await this.initializeData();
  }
}