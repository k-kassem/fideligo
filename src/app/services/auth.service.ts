import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { User, UserRole } from '../types';
import { StorageService } from './api-storage.service';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  register: (email: string, password: string, name: string, role: UserRole) => Promise<{ success: boolean; error?: string; user?: User }>;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private userSubject = new BehaviorSubject<User | null>(null);
  private isAuthenticatedSubject = new BehaviorSubject<boolean>(false);

  public user$ = this.userSubject.asObservable();
  public isAuthenticated$ = this.isAuthenticatedSubject.asObservable();

  constructor(private storageService: StorageService) {
    void this.initializeAuth();
  }

  private async initializeAuth() {
    await this.storageService.initializeData();
    const currentUser = await this.storageService.getCurrentUser();
    if (currentUser) {
      this.userSubject.next(currentUser);
      this.isAuthenticatedSubject.next(true);
    }
  }

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    try {
      const user = await this.storageService.login(email, password);
      this.userSubject.next(user);
      this.isAuthenticatedSubject.next(true);
      await this.storageService.setCurrentUser(user);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Email ou mot de passe incorrect';
      return { success: false, error: errorMsg };
    }
  }

  async logout() {
    this.userSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    await this.storageService.setCurrentUser(null);
  }

  async register(
    email: string,
    password: string,
    name: string,
    role: UserRole
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    const existingUser = await this.storageService.findUserByEmail(email);

    if (existingUser) {
      return { success: false, error: 'Cet email est déjà utilisé' };
    }

    const newUser = await this.storageService.addUser({
      email,
      password,
      name,
      role
    });

    return { success: true, user: newUser };
  }

  get user(): User | null {
    return this.userSubject.value;
  }

  get isAuthenticated(): boolean {
    return this.isAuthenticatedSubject.value;
  }
}