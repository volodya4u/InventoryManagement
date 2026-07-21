import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';
import { LoginComponent } from './login/login.component';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  {
    path: '',
    component: ShellComponent,
    canActivate: [authGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () => import('./dashboard/dashboard.component').then((module) => module.DashboardComponent)
      },
      {
        path: 'raw-materials',
        loadComponent: () => import('./raw-materials/raw-materials.component').then((module) => module.RawMaterialsComponent)
      },
      {
        path: 'products',
        loadComponent: () => import('./products/products.component').then((module) => module.ProductsComponent)
      },
      {
        path: 'sales',
        loadComponent: () => import('./sales/sales.component').then((module) => module.SalesComponent)
      },
      {
        path: 'reports/monthly-sales',
        loadComponent: () => import('./reports/monthly-sales/monthly-sales-report.component')
          .then((module) => module.MonthlySalesReportComponent)
      },
      {
        path: 'change-password',
        loadComponent: () => import('./change-password/change-password.component').then((module) => module.ChangePasswordComponent)
      },
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' }
    ]
  },
  { path: '**', redirectTo: 'dashboard' }
];
