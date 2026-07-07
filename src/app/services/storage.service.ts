import { Injectable } from '@angular/core';
import type { User, Restaurant, Client, Purchase, PointsBalance } from '../types';
import { INITIAL_ADMIN } from '../types';

// Clés de stockage
const KEYS = {
  USERS: 'fidelite_users',
  RESTAURANTS: 'fidelite_restaurants',
  CLIENTS: 'fidelite_clients',
  PURCHASES: 'fidelite_purchases',
  POINTS: 'fidelite_points',
  CURRENT_USER: 'fidelite_current_user'
};

@Injectable({
  providedIn: 'root'
})
export class StorageService {

  // Initialisation des données
  initializeData() {
    // Créer l'admin s'il n'existe pas
    const users = this.getUsers();
    if (users.length === 0) {
      const adminUser: User = {
        id: this.generateId(),
        email: INITIAL_ADMIN.email,
        password: INITIAL_ADMIN.password,
        role: 'admin',
        name: INITIAL_ADMIN.name,
        createdAt: new Date().toISOString()
      };
      this.saveUsers([adminUser]);
    }

    // Migration: ajouter le champ région aux clients existants
    const clients = this.getClients();
    let needsMigration = false;
    const migratedClients = clients.map(client => {
      if (!client.region) {
        needsMigration = true;
        return { ...client, region: '' };
      }
      return client;
    });

    if (needsMigration) {
      this.saveClients(migratedClients);
    }
  }

  // Utilitaires
  private generateId() {
    return Math.random().toString(36).substring(2, 15);
  }

  // Users
  getUsers(): User[] {
    const data = localStorage.getItem(KEYS.USERS);
    return data ? JSON.parse(data) : [];
  }

  saveUsers(users: User[]) {
    localStorage.setItem(KEYS.USERS, JSON.stringify(users));
  }

  addUser(user: Omit<User, 'id' | 'createdAt'>): User {
    const users = this.getUsers();
    const newUser: User = {
      ...user,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };
    users.push(newUser);
    this.saveUsers(users);
    return newUser;
  }

  findUserByEmail(email: string): User | undefined {
    return this.getUsers().find(u => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): User | undefined {
    return this.getUsers().find(u => u.id === id);
  }

  // Restaurants
  getRestaurants(): Restaurant[] {
    const data = localStorage.getItem(KEYS.RESTAURANTS);
    return data ? JSON.parse(data) : [];
  }

  saveRestaurants(restaurants: Restaurant[]) {
    localStorage.setItem(KEYS.RESTAURANTS, JSON.stringify(restaurants));
  }

  addRestaurant(restaurant: Omit<Restaurant, 'id' | 'createdAt'>): Restaurant {
    const restaurants = this.getRestaurants();
    const newRestaurant: Restaurant = {
      ...restaurant,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };
    restaurants.push(newRestaurant);
    this.saveRestaurants(restaurants);
    return newRestaurant;
  }

  findRestaurantByUserId(userId: string): Restaurant | undefined {
    return this.getRestaurants().find(r => r.userId === userId);
  }

  findRestaurantById(id: string): Restaurant | undefined {
    return this.getRestaurants().find(r => r.id === id);
  }

  deleteRestaurant(id: string) {
    const restaurants = this.getRestaurants().filter(r => r.id !== id);
    this.saveRestaurants(restaurants);
  }

  updateRestaurant(id: string, updates: Partial<Omit<Restaurant, 'id' | 'createdAt'>>): Restaurant | null {
    const restaurants = this.getRestaurants();
    const index = restaurants.findIndex(r => r.id === id);
    if (index === -1) return null;

    restaurants[index] = { ...restaurants[index], ...updates };
    this.saveRestaurants(restaurants);
    return restaurants[index];
  }

  updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): User | null {
    const users = this.getUsers();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) return null;

    users[index] = { ...users[index], ...updates };
    this.saveUsers(users);
    return users[index];
  }

  updateClient(id: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Client | null {
    const clients = this.getClients();
    const index = clients.findIndex(c => c.id === id);
    if (index === -1) return null;

    clients[index] = { ...clients[index], ...updates };
    this.saveClients(clients);
    return clients[index];
  }

  // Clients
  getClients(): Client[] {
    const data = localStorage.getItem(KEYS.CLIENTS);
    return data ? JSON.parse(data) : [];
  }

  saveClients(clients: Client[]) {
    localStorage.setItem(KEYS.CLIENTS, JSON.stringify(clients));
  }

  addClient(client: Omit<Client, 'id' | 'createdAt'>): Client {
    const clients = this.getClients();
    const newClient: Client = {
      ...client,
      id: this.generateId(),
      createdAt: new Date().toISOString()
    };
    clients.push(newClient);
    this.saveClients(clients);
    return newClient;
  }

  findClientByUserId(userId: string): Client | undefined {
    return this.getClients().find(c => c.userId === userId);
  }

  findClientById(id: string): Client | undefined {
    return this.getClients().find(c => c.id === id);
  }

  findClientByEmail(email: string): Client | undefined {
    return this.getClients().find(c => c.email.toLowerCase() === email.toLowerCase());
  }

  getAllClients(): Client[] {
    return this.getClients();
  }

  // Purchases
  getPurchases(): Purchase[] {
    const data = localStorage.getItem(KEYS.PURCHASES);
    return data ? JSON.parse(data) : [];
  }

  savePurchases(purchases: Purchase[]) {
    localStorage.setItem(KEYS.PURCHASES, JSON.stringify(purchases));
  }

  addPurchase(purchase: Omit<Purchase, 'id' | 'date'>): Purchase {
    const purchases = this.getPurchases();
    const newPurchase: Purchase = {
      ...purchase,
      id: this.generateId(),
      date: new Date().toISOString()
    };
    purchases.push(newPurchase);
    this.savePurchases(purchases);
    return newPurchase;
  }

  getPurchasesByClient(clientId: string): Purchase[] {
    return this.getPurchases().filter(p => p.clientId === clientId);
  }

  getPurchasesByRestaurant(restaurantId: string): Purchase[] {
    return this.getPurchases().filter(p => p.restaurantId === restaurantId);
  }

  getPurchasesByClientAndRestaurant(clientId: string, restaurantId: string): Purchase[] {
    return this.getPurchases().filter(p => p.clientId === clientId && p.restaurantId === restaurantId);
  }

  // Points Balance
  getPointsBalances(): PointsBalance[] {
    const data = localStorage.getItem(KEYS.POINTS);
    return data ? JSON.parse(data) : [];
  }

  savePointsBalances(balances: PointsBalance[]) {
    localStorage.setItem(KEYS.POINTS, JSON.stringify(balances));
  }

  getPointsBalance(clientId: string, restaurantId: string): number {
    const balances = this.getPointsBalances();
    const balance = balances.find(b => b.clientId === clientId && b.restaurantId === restaurantId);
    return balance ? balance.points : 0;
  }

  updatePointsBalance(clientId: string, restaurantId: string, pointsDelta: number): PointsBalance {
    const balances = this.getPointsBalances();
    const existingIndex = balances.findIndex(b => b.clientId === clientId && b.restaurantId === restaurantId);
    if (existingIndex >= 0) {
      balances[existingIndex].points += pointsDelta;
      balances[existingIndex].updatedAt = new Date().toISOString();
    } else {
      balances.push({
        clientId,
        restaurantId,
        points: pointsDelta,
        updatedAt: new Date().toISOString()
      });
    }

    this.savePointsBalances(balances);
    return balances[existingIndex >= 0 ? existingIndex : balances.length - 1];
  }

  getAllPointsForClient(clientId: string): { restaurant: Restaurant; points: number }[] {
    const balances = this.getPointsBalances().filter(b => b.clientId === clientId);
    return balances.map(b => {
      const restaurant = this.findRestaurantById(b.restaurantId);
      return {
        restaurant: restaurant!,
        points: b.points
      };
    }).filter(item => item.restaurant);
  }

  // Session
  getCurrentUser(): User | null {
    const data = localStorage.getItem(KEYS.CURRENT_USER);
    return data ? JSON.parse(data) : null;
  }

  setCurrentUser(user: User | null) {
    if (user) {
      localStorage.setItem(KEYS.CURRENT_USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(KEYS.CURRENT_USER);
    }
  }

  // Reset all data (pour les tests)
  resetAllData() {
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
    this.initializeData();
  }
}