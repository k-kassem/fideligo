import { Component, EventEmitter, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { StorageService } from '../../services/api-storage.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css']
})
export class LoginPageComponent {
  @Output() loginSuccess = new EventEmitter<void>();

  view: 'login' | 'register' | 'verify' = 'login';

  email = '';
  password = '';
  error = '';
  success = '';
  isLoading = false;

  registerModel = {
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    region: '',
    password: '',
    confirmPassword: ''
  };

  verifyModel = {
    email: '',
    code: ''
  };

  debugVerificationCode = '';

  constructor(
    private authService: AuthService,
    private storageService: StorageService
  ) {}

  async onSubmit() {
    this.error = '';
    this.success = '';
    this.isLoading = true;

    const result = await this.authService.login(this.email, this.password);

    if (result.success) {
      this.loginSuccess.emit();
    } else {
      this.error = result.error || 'Erreur de connexion';
    }

    this.isLoading = false;
  }

  showRegisterPage() {
    this.resetMessages();
    this.view = 'register';
  }

  showLoginPage() {
    this.resetMessages();
    this.view = 'login';
  }

  showVerifyPage(email: string) {
    this.resetMessages();
    this.verifyModel.email = email;
    this.verifyModel.code = '';
    this.view = 'verify';
  }

  async onRegisterSubmit() {
    this.resetMessages();

    if (!this.registerModel.firstName || !this.registerModel.lastName || !this.registerModel.email || !this.registerModel.phone || !this.registerModel.region || !this.registerModel.password) {
      this.error = 'Veuillez compléter tous les champs.';
      return;
    }

    if (this.registerModel.password.length < 6) {
      this.error = 'Le mot de passe doit contenir au moins 6 caractères.';
      return;
    }

    if (this.registerModel.password !== this.registerModel.confirmPassword) {
      this.error = 'La confirmation du mot de passe ne correspond pas.';
      return;
    }

    this.isLoading = true;

    try {
      const response = await this.storageService.registerClient({
        firstName: this.registerModel.firstName.trim(),
        lastName: this.registerModel.lastName.trim(),
        email: this.registerModel.email.trim(),
        phone: this.registerModel.phone.trim(),
        region: this.registerModel.region.trim(),
        password: this.registerModel.password
      });

      this.debugVerificationCode = response.verificationCode ?? '';
      this.success = 'Compte créé. Saisissez le code reçu par email pour activer votre compte.';
      this.showVerifyPage(this.registerModel.email.trim());
    } catch (error) {
      this.error = this.extractError(error, 'Impossible de créer le compte.');
    } finally {
      this.isLoading = false;
    }
  }

  async onVerifySubmit() {
    this.resetMessages();

    if (!this.verifyModel.email || !this.verifyModel.code) {
      this.error = 'Veuillez saisir l\'email et le code reçu.';
      return;
    }

    this.isLoading = true;

    try {
      const response = await this.storageService.verifyClientAccount(this.verifyModel.email.trim(), this.verifyModel.code.trim());
      this.success = response.message;
      this.email = this.verifyModel.email.trim();
      this.password = '';
      this.debugVerificationCode = '';
      this.view = 'login';
    } catch (error) {
      this.error = this.extractError(error, 'Code invalide ou expiré.');
    } finally {
      this.isLoading = false;
    }
  }

  async resendCode() {
    this.resetMessages();

    if (!this.verifyModel.email) {
      this.error = 'Veuillez saisir votre email.';
      return;
    }

    this.isLoading = true;

    try {
      const response = await this.storageService.resendClientVerificationCode(this.verifyModel.email.trim());
      this.success = response.message;
      this.debugVerificationCode = response.verificationCode ?? '';
    } catch (error) {
      this.error = this.extractError(error, 'Impossible de renvoyer le code.');
    } finally {
      this.isLoading = false;
    }
  }

  private resetMessages() {
    this.error = '';
    this.success = '';
  }

  private extractError(error: unknown, fallback: string): string {
    const responseError = (error as { error?: { error?: string } })?.error?.error;
    if (responseError) return responseError;
    return fallback;
  }
}