import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/api-storage.service';
import { User, Restaurant, Client, Purchase } from '../../types';

@Component({
  selector: 'app-restaurant-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './restaurant-dashboard.component.html',
  styleUrl: './restaurant-dashboard.component.css'
})
export class RestaurantDashboardComponent implements OnInit {
  user: User | null = null;
  restaurant: Restaurant | null = null;
  clients: Client[] = [];
  purchases: Purchase[] = [];
  clientPointsMap: Record<string, number> = {};
  clientNameMap: Record<string, string> = {};
  error = '';
  success = '';
  isRateSavedPopupOpen = false;
  private rateSavedPopupTimeout: ReturnType<typeof setTimeout> | null = null;
  activeTab = 'clients';
  pointsPerEuroInput = 1;

  // Taux de conversion de la valeur d'un point: 1 point = 0.10€
  readonly POINTS_TO_EURO_VALUE = 0.10;

  // Client creation form
  isClientDialogOpen = false;
  clientFirstName = '';
  clientLastName = '';
  clientEmail = '';
  clientPhone = '';
  clientRegion = '';
  clientPassword = '';

  // Client edit mode
  isEditMode = false;
  editingClient: Client | null = null;

  // Points form
  selectedClient: Client | null = null;
  searchEmail = '';
  purchaseAmount = '';
  pointsToAdd = '';
  pointsToUse = '';
  purchaseDescription = '';

  constructor(
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      if (user) {
        void this.loadRestaurant();
      }
    });
  }

  async loadRestaurant() {
    if (this.user) {
      this.restaurant = await this.storageService.findRestaurantByUserId(this.user.id) || null;
      if (this.restaurant) {
        this.pointsPerEuroInput = this.restaurant.pointsPerEuro ?? 1;
        await this.loadData();
      }
    }
  }

  async loadData() {
    if (this.restaurant) {
      this.clients = await this.storageService.getAllClients();
      this.purchases = await this.storageService.getPurchasesByRestaurant(this.restaurant.id);
      this.clientNameMap = this.clients.reduce((acc, client) => {
        acc[client.id] = `${client.firstName} ${client.lastName}`;
        return acc;
      }, {} as Record<string, string>);

      const entries = await Promise.all(
        this.clients.map(async (client) => {
          const points = await this.storageService.getPointsBalance(client.id, this.restaurant!.id);
          return [client.id, points] as const;
        })
      );

      this.clientPointsMap = Object.fromEntries(entries);
    }
  }

  async onSubmitClient() {
    this.error = '';
    this.success = '';

    try {
      // Validation des emails dupliqués
      const existingUser = await this.storageService.findUserByEmail(this.clientEmail);
      if (this.isEditMode && this.editingClient) {
        // En mode édition, vérifier si l'email est déjà utilisé par un autre utilisateur
        if (existingUser && existingUser.id !== this.editingClient.userId) {
          this.error = 'Cet email est déjà utilisé par un autre compte';
          return;
        }
      } else {
        // En mode création, vérifier si l'email est déjà utilisé
        if (existingUser) {
          this.error = 'Cet email est déjà utilisé';
          return;
        }
      }

      if (this.isEditMode && this.editingClient) {
        // Mode édition
        const user = await this.storageService.findUserById(this.editingClient.userId);
        if (!user) {
          this.error = 'Utilisateur associé non trouvé';
          return;
        }

        // Mettre à jour l'utilisateur
        await this.storageService.updateUser(user.id, {
          email: this.clientEmail,
          name: `${this.clientFirstName} ${this.clientLastName}`
        });

        // Mettre à jour le client
        await this.storageService.updateClient(this.editingClient.id, {
          firstName: this.clientFirstName,
          lastName: this.clientLastName,
          email: this.clientEmail,
          phone: this.clientPhone,
          region: this.clientRegion
        });

        // Mettre à jour le mot de passe si fourni
        if (this.clientPassword.trim()) {
          await this.storageService.updateUser(user.id, {
            password: this.clientPassword
          });
        }

        this.success = 'Client modifié avec succès !';
      } else {
        // Mode création
        // Create user client
        const userResult = await this.storageService.addUser({
          email: this.clientEmail,
          password: this.clientPassword,
          name: `${this.clientFirstName} ${this.clientLastName}`,
          role: 'client'
        });

        // Create client
        await this.storageService.addClient({
          firstName: this.clientFirstName,
          lastName: this.clientLastName,
          email: this.clientEmail,
          phone: this.clientPhone,
          region: this.clientRegion,
          userId: userResult.id
        });

        this.success = 'Client créé avec succès !';
      }

      await this.loadData();
      this.resetClientForm();
      this.isClientDialogOpen = false;
    } catch (err) {
      this.error = this.isEditMode ? 'Erreur lors de la modification du client' : 'Erreur lors de la création du client';
    }
  }

  resetClientForm() {
    this.clientFirstName = '';
    this.clientLastName = '';
    this.clientEmail = '';
    this.clientPhone = '';
    this.clientRegion = '';
    this.clientPassword = '';
    this.isEditMode = false;
    this.editingClient = null;
  }

  startEditClient(client: Client) {
    this.isEditMode = true;
    this.editingClient = client;

    // Pré-remplir le formulaire avec les données du client
    this.clientFirstName = client.firstName;
    this.clientLastName = client.lastName;
    this.clientEmail = client.email;
    this.clientPhone = client.phone || '';
    this.clientRegion = client.region || '';

    // Le mot de passe n'est pas pré-rempli pour des raisons de sécurité
    this.clientPassword = '';

    this.isClientDialogOpen = true;
    this.error = '';
    this.success = '';
  }

  cancelEdit() {
    this.resetClientForm();
    this.isClientDialogOpen = false;
  }

  async searchClient() {
    const client = await this.storageService.findClientByEmail(this.searchEmail);
    if (client) {
      this.selectedClient = client;
      this.error = '';
    } else {
      this.selectedClient = null;
      this.error = 'Client non trouvé';
    }
  }

  async handleAddPoints() {
    this.error = '';
    this.success = '';

    if (!this.selectedClient || !this.restaurant) {
      this.error = 'Veuillez sélectionner un client';
      return;
    }

    try {
      const amount = parseFloat(this.purchaseAmount) || 0;
      const bonusPoints = parseInt(this.pointsToAdd) || 0;
      const used = parseInt(this.pointsToUse) || 0;

      if (amount <= 0) {
        this.error = 'Le montant de l\'achat doit être supérieur à 0';
        return;
      }

      // Check if client has enough points
      const currentBalance = await this.storageService.getPointsBalance(this.selectedClient.id, this.restaurant.id);
      if (used > currentBalance) {
        this.error = `Le client n'a que ${currentBalance} points disponibles`;
        return;
      }

      // Create purchase (points calculés automatiquement selon le barème du restaurant)
      const purchase = await this.storageService.addPurchase({
        clientId: this.selectedClient.id,
        restaurantId: this.restaurant.id,
        amount,
        pointsUsed: used,
        bonusPoints,
        description: this.purchaseDescription || 'Achat'
      });

      this.success = `Achat enregistré ! ${purchase.pointsEarned} points gagnés, ${used} points utilisés`;
      await this.loadData();
      this.resetPointsForm();
    } catch (err) {
      this.error = 'Erreur lors de l\'attribution des points';
    }
  }

  async savePointsPerEuro() {
    if (!this.restaurant) return;

    const nextValue = Number(this.pointsPerEuroInput);
    if (Number.isNaN(nextValue) || nextValue < 0) {
      this.error = 'Le barème points/€ doit être un nombre positif';
      return;
    }

    this.error = '';
    this.success = '';

    try {
      const updated = await this.storageService.updateRestaurant(this.restaurant.id, { pointsPerEuro: nextValue });
      if (updated) {
        this.restaurant = updated;
        this.pointsPerEuroInput = updated.pointsPerEuro;
      }
      this.success = 'Barème points/€ mis à jour avec succès';
      this.showRateSavedPopup();
    } catch {
      this.error = 'Erreur lors de la mise à jour du barème points/€';
    }
  }

  showRateSavedPopup() {
    this.isRateSavedPopupOpen = true;

    if (this.rateSavedPopupTimeout) {
      clearTimeout(this.rateSavedPopupTimeout);
    }

    this.rateSavedPopupTimeout = setTimeout(() => {
      this.isRateSavedPopupOpen = false;
      this.rateSavedPopupTimeout = null;
    }, 3000);
  }

  closeRateSavedPopup() {
    this.isRateSavedPopupOpen = false;
    if (this.rateSavedPopupTimeout) {
      clearTimeout(this.rateSavedPopupTimeout);
      this.rateSavedPopupTimeout = null;
    }
  }

  resetPointsForm() {
    this.selectedClient = null;
    this.searchEmail = '';
    this.purchaseAmount = '';
    this.pointsToAdd = '';
    this.pointsToUse = '';
    this.purchaseDescription = '';
  }

  getClientPoints(clientId: string): number {
    if (!this.restaurant) return 0;
    return this.clientPointsMap[clientId] ?? 0;
  }

  getClientName(clientId: string): string {
    return this.clientNameMap[clientId] ?? 'Inconnu';
  }

  getTotalPointsEarned(): number {
    return this.purchases.reduce((sum, p) => sum + p.pointsEarned, 0);
  }

  // Convertir les points en euros
  pointsToEuros(points: number): number {
    return points * this.POINTS_TO_EURO_VALUE;
  }

  // Convertir les euros en points
  eurosToPoints(euros: number): number {
    return Math.floor(euros / this.POINTS_TO_EURO_VALUE);
  }

  // Calculer le montant restant après utilisation des points
  getRemainingAmount(): number {
    const amount = parseFloat(this.purchaseAmount) || 0;
    const pointsUsed = parseInt(this.pointsToUse) || 0;
    const eurosFromPoints = this.pointsToEuros(pointsUsed);
    return Math.max(0, amount - eurosFromPoints);
  }

  // Utiliser automatiquement le maximum de points possible
  useMaxPoints() {
    if (!this.selectedClient || !this.restaurant) return;

    const amount = parseFloat(this.purchaseAmount) || 0;
    const availablePoints = this.getClientPoints(this.selectedClient.id);
    const maxPointsToUse = Math.min(availablePoints, this.eurosToPoints(amount));

    this.pointsToUse = maxPointsToUse.toString();
  }

  // Méthode utilitaire pour parseInt dans le template
  parseIntValue(value: string): number {
    return parseInt(value) || 0;
  }

  async logout() {
    await this.authService.logout();
  }

  setActiveTab(tab: string) {
    this.activeTab = tab;
  }

  isSubscriptionExpired(subscriptionEndDate: string): boolean {
    if (!subscriptionEndDate) return false;
    const endDate = new Date(subscriptionEndDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day for fair comparison
    return endDate < today;
  }
}