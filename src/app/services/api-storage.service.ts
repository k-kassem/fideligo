import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { User, Restaurant, Client, Purchase, PointsBalance } from '../types';

type PointsByRestaurant = { restaurant: Restaurant; points: number };
type CreatePurchasePayload = Omit<Purchase, 'id' | 'date' | 'pointsEarned'> & { pointsEarned?: number; bonusPoints?: number };

@Injectable({
  providedIn: 'root'
})
export class StorageService {
  private readonly apiBase = '/api';

  constructor(private http: HttpClient) {}

  async initializeData(): Promise<void> {
    await firstValueFrom(this.http.post<{ ok: boolean }>(`${this.apiBase}/init`, {}));
  }

  async login(email: string, password: string): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${this.apiBase}/login`, { email, password }));
  }

  async getUsers(): Promise<User[]> {
    return firstValueFrom(this.http.get<User[]>(`${this.apiBase}/users`));
  }

  async addUser(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    return firstValueFrom(this.http.post<User>(`${this.apiBase}/users`, user));
  }

  async findUserByEmail(email: string): Promise<User | undefined> {
    const encoded = encodeURIComponent(email);
    const user = await firstValueFrom(this.http.get<User | null>(`${this.apiBase}/users/by-email/${encoded}`));
    return user ?? undefined;
  }

  async findUserById(id: string): Promise<User | undefined> {
    const user = await firstValueFrom(this.http.get<User | null>(`${this.apiBase}/users/${id}`));
    return user ?? undefined;
  }

  async updateUser(id: string, updates: Partial<Omit<User, 'id' | 'createdAt'>>): Promise<User | null> {
    const user = await firstValueFrom(this.http.patch<User | null>(`${this.apiBase}/users/${id}`, updates));
    return user ?? null;
  }

  async getRestaurants(): Promise<Restaurant[]> {
    return firstValueFrom(this.http.get<Restaurant[]>(`${this.apiBase}/restaurants`));
  }

  async addRestaurant(restaurant: Omit<Restaurant, 'id' | 'createdAt'>): Promise<Restaurant> {
    return firstValueFrom(this.http.post<Restaurant>(`${this.apiBase}/restaurants`, restaurant));
  }

  async findRestaurantByUserId(userId: string): Promise<Restaurant | undefined> {
    const restaurant = await firstValueFrom(
      this.http.get<Restaurant | null>(`${this.apiBase}/restaurants/by-user/${userId}`)
    );
    return restaurant ?? undefined;
  }

  async findRestaurantById(id: string): Promise<Restaurant | undefined> {
    const restaurant = await firstValueFrom(this.http.get<Restaurant | null>(`${this.apiBase}/restaurants/${id}`));
    return restaurant ?? undefined;
  }

  async deleteRestaurant(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<{ ok: boolean }>(`${this.apiBase}/restaurants/${id}`));
  }

  async updateRestaurant(
    id: string,
    updates: Partial<Omit<Restaurant, 'id' | 'createdAt'>>
  ): Promise<Restaurant | null> {
    const restaurant = await firstValueFrom(
      this.http.patch<Restaurant | null>(`${this.apiBase}/restaurants/${id}`, updates)
    );
    return restaurant ?? null;
  }

  async getClients(): Promise<Client[]> {
    return firstValueFrom(this.http.get<Client[]>(`${this.apiBase}/clients`));
  }

  async getAllClients(): Promise<Client[]> {
    return this.getClients();
  }

  async addClient(client: Omit<Client, 'id' | 'createdAt'>): Promise<Client> {
    return firstValueFrom(this.http.post<Client>(`${this.apiBase}/clients`, client));
  }

  async findClientByUserId(userId: string): Promise<Client | undefined> {
    const client = await firstValueFrom(this.http.get<Client | null>(`${this.apiBase}/clients/by-user/${userId}`));
    return client ?? undefined;
  }

  async findClientById(id: string): Promise<Client | undefined> {
    const client = await firstValueFrom(this.http.get<Client | null>(`${this.apiBase}/clients/${id}`));
    return client ?? undefined;
  }

  async findClientByEmail(email: string): Promise<Client | undefined> {
    const encoded = encodeURIComponent(email);
    const client = await firstValueFrom(this.http.get<Client | null>(`${this.apiBase}/clients/by-email/${encoded}`));
    return client ?? undefined;
  }

  async updateClient(id: string, updates: Partial<Omit<Client, 'id' | 'createdAt'>>): Promise<Client | null> {
    const client = await firstValueFrom(this.http.patch<Client | null>(`${this.apiBase}/clients/${id}`, updates));
    return client ?? null;
  }

  async deleteClient(id: string): Promise<void> {
    await firstValueFrom(this.http.delete<{ ok: boolean }>(`${this.apiBase}/clients/${id}`));
  }

  async getPurchases(): Promise<Purchase[]> {
    return firstValueFrom(this.http.get<Purchase[]>(`${this.apiBase}/purchases`));
  }

  async addPurchase(purchase: CreatePurchasePayload): Promise<Purchase> {
    return firstValueFrom(this.http.post<Purchase>(`${this.apiBase}/purchases`, purchase));
  }

  async getPurchasesByClient(clientId: string): Promise<Purchase[]> {
    return firstValueFrom(this.http.get<Purchase[]>(`${this.apiBase}/purchases?clientId=${clientId}`));
  }

  async getPurchasesByRestaurant(restaurantId: string): Promise<Purchase[]> {
    return firstValueFrom(this.http.get<Purchase[]>(`${this.apiBase}/purchases?restaurantId=${restaurantId}`));
  }

  async getPurchasesByClientAndRestaurant(clientId: string, restaurantId: string): Promise<Purchase[]> {
    return firstValueFrom(
      this.http.get<Purchase[]>(`${this.apiBase}/purchases?clientId=${clientId}&restaurantId=${restaurantId}`)
    );
  }

  async getPointsBalance(clientId: string, restaurantId: string): Promise<number> {
    const row = await firstValueFrom(
      this.http.get<PointsBalance | null>(`${this.apiBase}/points/balance?clientId=${clientId}&restaurantId=${restaurantId}`)
    );
    return row?.points ?? 0;
  }

  async updatePointsBalance(clientId: string, restaurantId: string, pointsDelta: number): Promise<PointsBalance> {
    return firstValueFrom(
      this.http.post<PointsBalance>(`${this.apiBase}/points/update`, { clientId, restaurantId, pointsDelta })
    );
  }

  async getAllPointsForClient(clientId: string): Promise<PointsByRestaurant[]> {
    return firstValueFrom(this.http.get<PointsByRestaurant[]>(`${this.apiBase}/points/client/${clientId}`));
  }

  async getCurrentUser(): Promise<User | null> {
    const user = await firstValueFrom(this.http.get<User | null>(`${this.apiBase}/session/current`));
    return user ?? null;
  }

  async setCurrentUser(user: User | null): Promise<void> {
    await firstValueFrom(this.http.put<{ ok: boolean }>(`${this.apiBase}/session/current`, { userId: user?.id ?? null }));
  }

  async resetAllData(): Promise<void> {
    await firstValueFrom(this.http.post<{ ok: boolean }>(`${this.apiBase}/reset`, {}));
    await this.initializeData();
  }
}
