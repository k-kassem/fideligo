import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
import { User, Client, Purchase, Restaurant } from '../../types';

interface PointsInfo {
  restaurant: Restaurant;
  points: number;
}

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.css'
})
export class ClientDashboardComponent implements OnInit {
  user: User | null = null;
  client: Client | null = null;
  purchases: Purchase[] = [];
  pointsInfo: PointsInfo[] = [];
  activeTab = 'overview';

  constructor(
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      if (user) {
        this.loadClient();
      }
    });
  }

  loadClient() {
    if (this.user) {
      this.client = this.storageService.findClientByUserId(this.user.id) || null;
      if (this.client) {
        this.loadData();
      }
    }
  }

  loadData() {
    if (this.client) {
      this.purchases = this.storageService.getPurchasesByClient(this.client.id);
      this.pointsInfo = this.storageService.getAllPointsForClient(this.client.id);
    }
  }

  getRestaurantName(restaurantId: string): string {
    const restaurant = this.storageService.findRestaurantById(restaurantId);
    return restaurant ? restaurant.name : 'Restaurant inconnu';
  }

  getTotalPoints(): number {
    return this.pointsInfo.reduce((sum, info) => sum + info.points, 0);
  }

  getTotalPurchases(): number {
    return this.purchases.reduce((sum, p) => sum + p.amount, 0);
  }

  getTotalPointsEarned(): number {
    return this.purchases.reduce((sum, p) => sum + p.pointsEarned, 0);
  }

  getTotalPointsUsed(): number {
    return this.purchases.reduce((sum, p) => sum + p.pointsUsed, 0);
  }

  get sortedPurchases(): Purchase[] {
    return this.purchases.slice().sort((a, b) =>
      new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }

  logout() {
    this.authService.logout();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }
}