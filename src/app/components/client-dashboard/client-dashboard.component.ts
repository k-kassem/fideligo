import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/api-storage.service';
import { User, Client, Purchase, Restaurant } from '../../types';

interface PointsInfo {
  restaurant: Restaurant;
  points: number;
}

@Component({
  selector: 'app-client-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './client-dashboard.component.html',
  styleUrl: './client-dashboard.component.css'
})
export class ClientDashboardComponent implements OnInit {
  user: User | null = null;
  client: Client | null = null;
  purchases: Purchase[] = [];
  pointsInfo: PointsInfo[] = [];
  restaurants: Restaurant[] = [];
  restaurantNameMap: Record<string, string> = {};
  activeTab = 'overview';

  // History filter & pagination
  historyFilterRestaurantId = '';
  historyPage = 1;
  readonly historyPageSize = 10;

  // Modal state
  showAddPurchaseModal = false;
  addPurchaseLoading = false;
  addPurchaseError = '';
  newPurchase = {
    restaurantId: '',
    amount: null as number | null,
    description: '',
    usePoints: false,
    pointsToUse: 0
  };

  constructor(
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      if (user) {
        void this.loadClient();
      }
    });
  }

  async loadClient() {
    if (this.user) {
      this.client = await this.storageService.findClientByUserId(this.user.id) || null;
      if (this.client) {
        await this.loadData();
      }
    }
  }

  async loadData() {
    if (this.client) {
      [this.purchases, this.pointsInfo, this.restaurants] = await Promise.all([
        this.storageService.getPurchasesByClient(this.client.id),
        this.storageService.getAllPointsForClient(this.client.id),
        this.storageService.getRestaurants()
      ]);
      this.restaurantNameMap = this.restaurants.reduce((acc, r) => {
        acc[r.id] = r.name;
        return acc;
      }, {} as Record<string, string>);
    }
  }

  getRestaurantName(restaurantId: string): string {
    return this.restaurantNameMap[restaurantId] ?? 'Restaurant inconnu';
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

  get filteredPurchases(): Purchase[] {
    const sorted = this.sortedPurchases;
    if (!this.historyFilterRestaurantId) return sorted;
    return sorted.filter(p => p.restaurantId === this.historyFilterRestaurantId);
  }

  get historyTotalPages(): number {
    return Math.max(1, Math.ceil(this.filteredPurchases.length / this.historyPageSize));
  }

  get paginatedPurchases(): Purchase[] {
    const start = (this.historyPage - 1) * this.historyPageSize;
    return this.filteredPurchases.slice(start, start + this.historyPageSize);
  }

  get historyPageRange(): number[] {
    return Array.from({ length: this.historyTotalPages }, (_, i) => i + 1);
  }

  onHistoryFilterChange() {
    this.historyPage = 1;
  }

  historyPrevPage() {
    if (this.historyPage > 1) this.historyPage--;
  }

  historyNextPage() {
    if (this.historyPage < this.historyTotalPages) this.historyPage++;
  }

  historyGoToPage(page: number) {
    this.historyPage = page;
  }

  getAvailablePointsForRestaurant(restaurantId: string): number {
    return this.pointsInfo.find(i => i.restaurant.id === restaurantId)?.points ?? 0;
  }

  getPointsPerEuroForRestaurant(restaurantId: string): number {
    return this.restaurants.find((r) => r.id === restaurantId)?.pointsPerEuro ?? 1;
  }

  getPointsByRestaurantForDisplay(): Array<{ restaurantId: string; restaurantName: string; points: number }> {
    return this.restaurants
      .map((restaurant) => ({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        points: this.getAvailablePointsForRestaurant(restaurant.id)
      }))
      .sort((a, b) => a.restaurantName.localeCompare(b.restaurantName));
  }

  getMaxPointsToUse(): number {
    if (!this.newPurchase.restaurantId || !this.newPurchase.amount) return 0;
    const available = this.getAvailablePointsForRestaurant(this.newPurchase.restaurantId);
    // max : points disponibles, mais pas plus que le montant en euros
    return Math.min(available, Math.floor(this.newPurchase.amount));
  }

  openAddPurchaseModal() {
    this.newPurchase = { restaurantId: '', amount: null, description: '', usePoints: false, pointsToUse: 0 };
    this.addPurchaseError = '';
    this.showAddPurchaseModal = true;
  }

  closeAddPurchaseModal() {
    this.showAddPurchaseModal = false;
  }

  onRestaurantChange() {
    this.newPurchase.pointsToUse = 0;
  }

  onUsePointsChange() {
    if (!this.newPurchase.usePoints) {
      this.newPurchase.pointsToUse = 0;
    }
  }

  async submitAddPurchase() {
    if (!this.client) return;
    if (!this.newPurchase.restaurantId) {
      this.addPurchaseError = 'Veuillez sélectionner un restaurant.';
      return;
    }
    if (!this.newPurchase.amount || this.newPurchase.amount <= 0) {
      this.addPurchaseError = 'Veuillez entrer un montant valide.';
      return;
    }
    if (!this.newPurchase.description.trim()) {
      this.addPurchaseError = 'Veuillez entrer une description.';
      return;
    }

    const pointsToUse = this.newPurchase.usePoints ? Math.min(this.newPurchase.pointsToUse, this.getMaxPointsToUse()) : 0;

    this.addPurchaseLoading = true;
    this.addPurchaseError = '';

    try {
      await this.storageService.addPurchase({
        clientId: this.client.id,
        restaurantId: this.newPurchase.restaurantId,
        amount: this.newPurchase.amount,
        pointsUsed: pointsToUse,
        description: this.newPurchase.description.trim()
      });
      await this.loadData();
      this.closeAddPurchaseModal();
      this.activeTab = 'purchases';
    } catch {
      this.addPurchaseError = 'Une erreur est survenue. Veuillez réessayer.';
    } finally {
      this.addPurchaseLoading = false;
    }
  }

  async logout() {
    await this.authService.logout();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  readonly Math = Math;
}