import { APP_INITIALIZER, ApplicationConfig } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import { StorageService } from './services/api-storage.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideHttpClient(),
    provideRouter(routes),
    {
      provide: APP_INITIALIZER,
      multi: true,
      deps: [StorageService],
      useFactory: (storageService: StorageService) => {
        return () => storageService.initializeData().catch((error) => {
          console.error('API initialization failed:', error);
        });
      }
    }
  ]
};
