import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/storage.service';
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
  error = '';
  success = '';
  activeTab = 'clients';

  // Taux de conversion: 1 point = 0.10€
  readonly POINTS_TO_EURO_RATE = 0.10;

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
        this.loadRestaurant();
      }
    });
  }

  loadRestaurant() {
    if (this.user) {
      this.restaurant = this.storageService.findRestaurantByUserId(this.user.id) || null;
      if (this.restaurant) {
        this.loadData();
      }
    }
  }

  loadData() {
    if (this.restaurant) {
      this.clients = this.storageService.getAllClients();
      this.purchases = this.storageService.getPurchasesByRestaurant(this.restaurant.id);
    }
  }

  onSubmitClient() {
    this.error = '';
    this.success = '';

    try {
      // Validation des emails dupliqués
      const existingUser = this.storageService.findUserByEmail(this.clientEmail);
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
        const user = this.storageService.findUserById(this.editingClient.userId);
        if (!user) {
          this.error = 'Utilisateur associé non trouvé';
          return;
        }

        // Mettre à jour l'utilisateur
        this.storageService.updateUser(user.id, {
          email: this.clientEmail,
          name: `${this.clientFirstName} ${this.clientLastName}`
        });

        // Mettre à jour le client
        this.storageService.updateClient(this.editingClient.id, {
          firstName: this.clientFirstName,
          lastName: this.clientLastName,
          email: this.clientEmail,
          phone: this.clientPhone,
          region: this.clientRegion
        });

        // Mettre à jour le mot de passe si fourni
        if (this.clientPassword.trim()) {
          this.storageService.updateUser(user.id, {
            password: this.clientPassword
          });
        }

        this.success = 'Client modifié avec succès !';
      } else {
        // Mode création
        // Create user client
        const userResult = this.storageService.addUser({
          email: this.clientEmail,
          password: this.clientPassword,
          name: `${this.clientFirstName} ${this.clientLastName}`,
          role: 'client'
        });

        // Create client
        this.storageService.addClient({
          firstName: this.clientFirstName,
          lastName: this.clientLastName,
          email: this.clientEmail,
          phone: this.clientPhone,
          region: this.clientRegion,
          userId: userResult.id
        });

        this.success = 'Client créé avec succès !';
      }

      this.loadData();
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

  searchClient() {
    const client = this.storageService.findClientByEmail(this.searchEmail);
    if (client) {
      this.selectedClient = client;
      this.error = '';
    } else {
      this.selectedClient = null;
      this.error = 'Client non trouvé';
    }
  }

  handleAddPoints() {
    this.error = '';
    this.success = '';

    if (!this.selectedClient || !this.restaurant) {
      this.error = 'Veuillez sélectionner un client';
      return;
    }

    try {
      const amount = parseFloat(this.purchaseAmount) || 0;
      const earned = parseInt(this.pointsToAdd) || 0;
      const used = parseInt(this.pointsToUse) || 0;

      // Check if client has enough points
      const currentBalance = this.storageService.getPointsBalance(this.selectedClient.id, this.restaurant.id);
      if (used > currentBalance) {
        this.error = `Le client n'a que ${currentBalance} points disponibles`;
        return;
      }

      // Create purchase
      this.storageService.addPurchase({
        clientId: this.selectedClient.id,
        restaurantId: this.restaurant.id,
        amount,
        pointsEarned: earned,
        pointsUsed: used,
        description: this.purchaseDescription || 'Achat'
      });

      // Update points
      this.storageService.updatePointsBalance(this.selectedClient.id, this.restaurant.id, earned - used);

      this.success = `Points mis à jour ! ${earned} ajoutés, ${used} utilisés`;
      this.loadData();
      this.resetPointsForm();
    } catch (err) {
      this.error = 'Erreur lors de l\'attribution des points';
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
    return this.storageService.getPointsBalance(clientId, this.restaurant.id);
  }

  getClientName(clientId: string): string {
    const client = this.storageService.findClientById(clientId);
    return client ? `${client.firstName} ${client.lastName}` : 'Inconnu';
  }

  getTotalPointsEarned(): number {
    return this.purchases.reduce((sum, p) => sum + p.pointsEarned, 0);
  }

  // Convertir les points en euros
  pointsToEuros(points: number): number {
    return points * this.POINTS_TO_EURO_RATE;
  }

  // Convertir les euros en points
  eurosToPoints(euros: number): number {
    return Math.floor(euros / this.POINTS_TO_EURO_RATE);
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

  logout() {
    this.authService.logout();
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