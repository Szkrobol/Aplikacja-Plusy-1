import { Routes } from '@angular/router';
import { authGuard, groupGuard, guestGuard } from './core/guards/auth.guards';
import { MainLayout } from './layout/main-layout/main-layout';

export const routes: Routes = [
  // Public screens (signed-out users only)
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login/login').then((m) => m.Login),
  },
  {
    path: 'register',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/register/register').then((m) => m.Register),
  },

  // Signed in, but no profile or group required yet
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile').then((m) => m.ProfilePage),
  },
  {
    path: 'join-group',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./features/groups/join-group/join-group').then((m) => m.JoinGroup),
  },

  // Everything that needs a group lives inside the layout (header + content)
  {
    path: '',
    component: MainLayout,
    canActivate: [groupGuard],
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () => import('./features/home/home').then((m) => m.Home),
      },
      // Admin-only screens get `canActivate: [adminGuard]` (import it from auth.guards), e.g.:
      // { path: 'admin/task-sets', canActivate: [adminGuard], loadComponent: ... },
    ],
  },

  { path: '**', redirectTo: '' },
];