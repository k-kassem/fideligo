// Types pour le système de fidélité restaurant

export type UserRole = 'admin' | 'restaurant' | 'client';

export interface User {
  id: string;
  email: string;
  password: string;
  role: UserRole;
  name: string;
  createdAt: string;
}

export interface Restaurant {
  id: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  description: string;
  userId: string; // Référence à l'utilisateur restaurant
  pointsPerEuro: number; // Nombre de points gagnés par euro dépensé
  subscriptionEndDate?: string; // Date de fin de souscription (optionnelle)
  createdAt: string;
}

export interface Client {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  region: string;
  userId: string; // Référence à l'utilisateur client
  createdAt: string;
}

export interface Purchase {
  id: string;
  clientId: string;
  restaurantId: string;
  amount: number;
  pointsEarned: number;
  pointsUsed: number;
  description: string;
  date: string;
}

export interface PointsBalance {
  clientId: string;
  restaurantId: string;
  points: number;
  updatedAt: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}

// Données initiales pour la démo
export const INITIAL_ADMIN = {
  email: 'admin@fidelite.com',
  password: 'admin123',
  name: 'Administrateur'
};