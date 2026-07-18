import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginComponent } from './login/login.component';
import { ShellComponent } from './layout/shell.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { RawMaterialsComponent } from './raw-materials/raw-materials.component';
import { ProductsComponent } from './products/products.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      { path: 'dashboard', component: DashboardComponent },
      { path: 'raw-materials', component: RawMaterialsComponent },
      { path: 'products', component: ProductsComponent },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
