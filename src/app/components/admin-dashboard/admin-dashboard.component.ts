import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/api-storage.service';
import { Restaurant, Client } from '../../types';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {
  restaurants: Restaurant[] = [];
  clients: Client[] = [];
  isDialogOpen = false;
  error = '';
  success = '';

  // Pagination
  restaurantsCurrentPage = 1;
  clientsCurrentPage = 1;
  itemsPerPage = 10;

  // Error popup
  isErrorPopupOpen = false;
  errorPopupMessage = '';

  // Form state
  name = '';
  email = '';
  password = '';
  phone = '';
  address = '';
  description = '';
  subscriptionEndDate = '';

  // Edit mode
  isEditMode = false;
  editingRestaurant: Restaurant | null = null;

  constructor(
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  ngOnInit() {
    void this.loadRestaurants();
    void this.loadClients();
  }

  async loadRestaurants() {
    this.restaurants = await this.storageService.getRestaurants();
  }

  async loadClients() {
    this.clients = await this.storageService.getClients();
  }

  // Pagination getters
  get paginatedRestaurants(): Restaurant[] {
    const startIndex = (this.restaurantsCurrentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.restaurants.slice(startIndex, endIndex);
  }

  get paginatedClients(): Client[] {
    const startIndex = (this.clientsCurrentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    return this.clients.slice(startIndex, endIndex);
  }

  get restaurantsTotalPages(): number {
    return Math.ceil(this.restaurants.length / this.itemsPerPage);
  }

  get clientsTotalPages(): number {
    return Math.ceil(this.clients.length / this.itemsPerPage);
  }

  // Pagination methods
  changeRestaurantsPage(page: number) {
    if (page >= 1 && page <= this.restaurantsTotalPages) {
      this.restaurantsCurrentPage = page;
    }
  }

  changeClientsPage(page: number) {
    if (page >= 1 && page <= this.clientsTotalPages) {
      this.clientsCurrentPage = page;
    }
  }

  getPageNumbers(totalPages: number, currentPage: number): number[] {
    const pages: number[] = [];
    const maxVisiblePages = 5;
    
    if (totalPages <= maxVisiblePages) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
      let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
      
      if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
      }
      
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }
    }
    
    return pages;
  }

  getPaginationInfo(currentPage: number, itemsPerPage: number, totalItems: number) {
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);
    return { start, end, total: totalItems };
  }

  isSubscriptionExpired(subscriptionEndDate: string): boolean {
    if (!subscriptionEndDate) return false;
    const endDate = new Date(subscriptionEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for fair comparison
    return endDate < today;
  }

  async onSubmit() {
    this.error = '';
    this.success = '';

    // Validation des emails dupliqués
    const existingUser = await this.storageService.findUserByEmail(this.email);
    if (this.isEditMode && this.editingRestaurant) {
      // En mode édition, vérifier si l'email est déjà utilisé par un autre utilisateur
      if (existingUser && existingUser.id !== this.editingRestaurant.userId) {
        this.showErrorPopup('Cet email est déjà utilisé par un autre compte');
        return;
      }
    } else {
      // En mode création, vérifier si l'email est déjà utilisé
      if (existingUser) {
        this.showErrorPopup('Cet email est déjà utilisé par un autre compte');
        return;
      }
    }

    try {
      if (this.isEditMode && this.editingRestaurant) {
        // Mode édition
        const user = await this.storageService.findUserById(this.editingRestaurant.userId);
        if (!user) {
          this.error = 'Utilisateur associé non trouvé';
          return;
        }

        // Mettre à jour l'utilisateur
        await this.storageService.updateUser(user.id, {
          email: this.email,
          name: this.name
        });

        // Mettre à jour le restaurant
        await this.storageService.updateRestaurant(this.editingRestaurant.id, {
          name: this.name,
          email: this.email,
          phone: this.phone,
          address: this.address,
          description: this.description,
          subscriptionEndDate: this.subscriptionEndDate || undefined
        });

        // Mettre à jour le mot de passe si fourni
        if (this.password.trim()) {
          await this.storageService.updateUser(user.id, {
            password: this.password
          });
        }

        this.success = 'Restaurant modifié avec succès !';
      } else {
        // Mode création
        // Créer l'utilisateur restaurant
        const userResult = await this.storageService.addUser({
          email: this.email,
          password: this.password,
          name: this.name,
          role: 'restaurant'
        });

        // Créer le restaurant
        await this.storageService.addRestaurant({
          name: this.name,
          email: this.email,
          phone: this.phone,
          address: this.address,
          description: this.description,
          userId: userResult.id,
          subscriptionEndDate: this.subscriptionEndDate || undefined
        });

        this.success = 'Restaurant créé avec succès !';
      }

      await this.loadRestaurants();
      this.resetForm();
      this.isDialogOpen = false;
    } catch (err) {
      this.error = this.isEditMode ? 'Erreur lors de la modification du restaurant' : 'Erreur lors de la création du restaurant';
    }
  }

  resetForm() {
    this.name = '';
    this.email = '';
    this.password = '';
    this.phone = '';
    this.address = '';
    this.description = '';
    this.subscriptionEndDate = '';
    this.isEditMode = false;
    this.editingRestaurant = null;
  }

  startEdit(restaurant: Restaurant) {
    this.isEditMode = true;
    this.editingRestaurant = restaurant;

    // Pré-remplir le formulaire avec les données du restaurant
    this.name = restaurant.name;
    this.email = restaurant.email;
    this.phone = restaurant.phone || '';
    this.address = restaurant.address || '';
    this.description = restaurant.description || '';
    this.subscriptionEndDate = restaurant.subscriptionEndDate || '';

    // Le mot de passe n'est pas pré-rempli pour des raisons de sécurité
    this.password = '';

    this.isDialogOpen = true;
    this.error = '';
    this.success = '';
  }

  cancelEdit() {
    this.resetForm();
    this.isDialogOpen = false;
  }

  showErrorPopup(message: string) {
    this.errorPopupMessage = message;
    this.isErrorPopupOpen = true;
  }

  closeErrorPopup() {
    this.isErrorPopupOpen = false;
    this.errorPopupMessage = '';
  }

  async deleteRestaurant(id: string) {
    if (confirm('Êtes-vous sûr de vouloir supprimer ce restaurant ?')) {
      await this.storageService.deleteRestaurant(id);
      await this.loadRestaurants();
    }
  }

  async logout() {
    await this.authService.logout();
  }
}