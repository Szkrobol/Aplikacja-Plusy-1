import { Routes } from '@angular/router';

export const routes: Routes = [
    { path: 'register', 
        loadComponent: () => import('./features/auth/register/register').then(m => m.Register) },
        { path: 'login', 
            loadComponent: () => import('./features/auth/login/login').then(m => m.Login) },
            { path: 'join-group', loadComponent: () => import('./features/groups/join-group/join-group').then(m => m.JoinGroup) }
];
