import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AuthService } from './services/auth.service';
import { LoginPageComponent } from './components/login-page/login-page.component';
import { AdminDashboardComponent } from './components/admin-dashboard/admin-dashboard.component';
import { RestaurantDashboardComponent } from './components/restaurant-dashboard/restaurant-dashboard.component';
import { ClientDashboardComponent } from './components/client-dashboard/client-dashboard.component';
import { User } from './types';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, LoginPageComponent, AdminDashboardComponent, RestaurantDashboardComponent, ClientDashboardComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {
  title = 'loyality';
  user: User | null = null;
  isAuthenticated = false;
  isLoading = true;

  constructor(private authService: AuthService) {}

  ngOnInit() {
    this.authService.user$.subscribe(user => {
      this.user = user;
      this.isAuthenticated = this.authService.isAuthenticated;
    });

    // Simulate loading
    setTimeout(() => {
      this.isLoading = false;
    }, 500);
  }

  onLoginSuccess() {
    this.isLoading = false;
  }
}
