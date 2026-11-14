import { Routes } from '@angular/router';
import { authGuard, groupGuard, guestGuard } from './core/guards/auth.guards';

export const routes: Routes = [
  { path: 'login', canActivate: [guestGuard], loadComponent: () => import('./features/auth/login/login').then(m => m.Login) },
  { path: 'register', canActivate: [guestGuard], loadComponent: () => import('./features/auth/register/register').then(m => m.Register) },
  { path: 'join-group', canActivate: [authGuard], loadComponent: () => import('./features/groups/join-group/join-group').then(m => m.JoinGroup) },
  {
    path: '',
    canActivate: [groupGuard],
    children: [
    ],
  },
  { path: '**', redirectTo: '' },
];
