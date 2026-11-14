import { inject } from '@angular/core';
import { CanActivateFn, Router, UrlTree } from '@angular/router';
import { SessionService } from '../services/session.service';

/** Redirect to /login, remembering where the user wanted to go. */
function toLogin(router: Router, url: string): UrlTree {
  return router.createUrlTree(['/login'], url === '/' ? {} : { queryParams: { returnUrl: url } });
}

/**
 * Shared check for routes that need a group: signed in and a member of at least one group.
 * Plain function (not a guard) so other guards can reuse it with a narrow return type.
 */
async function requireGroup(
  session: SessionService,
  router: Router,
  url: string,
): Promise<true | UrlTree> {
  await session.whenReady();
  if (!session.isAuthenticated()) {
    return toLogin(router, url);
  }

  const memberships = await session.ensureMemberships();
  return memberships.length > 0 ? true : router.createUrlTree(['/join-group']);
}

/** Signed-in users only. Use on pages that do not need a group (e.g. /join-group). */
export const authGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  await session.whenReady();
  return session.isAuthenticated() ? true : toLogin(router, state.url);
};

/** Signed-out users only (login, register). Signed-in users are sent to the app root. */
export const guestGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);

  await session.whenReady();
  return session.isAuthenticated() ? router.createUrlTree(['/']) : true;
};

/**
 * Signed-in users who belong to at least one group. Implies `authGuard`, so use it on its own.
 * Users without a group are sent to /join-group.
 */
export const groupGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  return requireGroup(session, router, state.url);
};

/** Group admins only. Implies `groupGuard`. Students are sent to the app root. */
export const adminGuard: CanActivateFn = async (_route, state) => {
  const session = inject(SessionService);
  const router = inject(Router);

  const allowed = await requireGroup(session, router, state.url);
  if (allowed !== true) {
    return allowed;
  }
  return session.isAdmin() ? true : router.createUrlTree(['/']);
};