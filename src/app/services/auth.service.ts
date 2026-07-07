import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { User, UserRole } from '../types';
import { StorageService } from './storage.service';

export interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
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
    this.initializeAuth();
  }

  private initializeAuth() {
    this.storageService.initializeData();
    const currentUser = this.storageService.getCurrentUser();
    if (currentUser) {
      this.userSubject.next(currentUser);
      this.isAuthenticatedSubject.next(true);
    }
  }

  async login(email: string, password: string): Promise<{ success: boolean; error?: string }> {
    const foundUser = this.storageService.findUserByEmail(email);

    if (!foundUser) {
      return { success: false, error: 'Email ou mot de passe incorrect' };
    }

    if (foundUser.password !== password) {
      return { success: false, error: 'Email ou mot de passe incorrect' };
    }

    this.userSubject.next(foundUser);
    this.isAuthenticatedSubject.next(true);
    this.storageService.setCurrentUser(foundUser);
    return { success: true };
  }

  logout() {
    this.userSubject.next(null);
    this.isAuthenticatedSubject.next(false);
    this.storageService.setCurrentUser(null);
  }

  async register(
    email: string,
    password: string,
    name: string,
    role: UserRole
  ): Promise<{ success: boolean; error?: string; user?: User }> {
    const existingUser = this.storageService.findUserByEmail(email);

    if (existingUser) {
      return { success: false, error: 'Cet email est déjà utilisé' };
    }

    const newUser = this.storageService.addUser({
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