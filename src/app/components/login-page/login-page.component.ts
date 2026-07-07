import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './login-page.component.html',
  styleUrls: ['./login-page.component.css']
})
export class LoginPageComponent {
  email = '';
  password = '';
  error = '';
  isLoading = false;

  constructor(private authService: AuthService) {}

  async onSubmit() {
    this.error = '';
    this.isLoading = true;

    const result = await this.authService.login(this.email, this.password);

    if (result.success) {
      // Navigation will be handled by parent
    } else {
      this.error = result.error || 'Erreur de connexion';
    }

    this.isLoading = false;
  }
}