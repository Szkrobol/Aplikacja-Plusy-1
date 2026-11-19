import { inject, Service } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SessionService } from './session.service';
import { SupabaseService } from './supabase.service';

export type SignUpResult =
  | { ok: true; session: Session | null }
  | { ok: false; message: string };

export type SignInResult = { ok: true } | { ok: false; message: string };

export type ChangePasswordResult =
  | { ok: true }
  | { ok: false; message: string; /** The current password was wrong. */ wrongCurrent?: boolean };

@Service()
export class AuthService {
  private readonly supabase = inject(SupabaseService);
  private readonly session = inject(SessionService);

  /**
   * Creates a new account. With "Confirm email" disabled in Supabase,
   * the returned session is set immediately and the user is already signed in.
   */
  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.supabase.client.auth.signUp({
      email: this.normalizeEmail(email),
      password,
    });

    if (error) {
      return { ok: false, message: this.signUpMessage(error) };
    }
    return { ok: true, session: data.session };
  }

  /** Signs in with email and password. supabase-js stores and refreshes the session itself. */
  async signIn(email: string, password: string): Promise<SignInResult> {
    const { error } = await this.supabase.client.auth.signInWithPassword({
      email: this.normalizeEmail(email),
      password,
    });

    if (error) {
      return { ok: false, message: this.signInMessage(error) };
    }
    return { ok: true };
  }

  /** Clears the local session and revokes the refresh token. */
  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
  }

  /**
   * Changes the password of the signed-in user. The current password is checked first by signing
   * in with it (Supabase has no separate "verify password" call), then the new one is saved.
   */
  async changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
    const email = this.session.user()?.email;
    if (!email) {
      return { ok: false, message: 'Twoja sesja wygasła. Zaloguj się ponownie.' };
    }

    const check = await this.supabase.client.auth.signInWithPassword({
      email,
      password: currentPassword,
    });
    if (check.error) {
      return check.error.code === 'invalid_credentials'
        ? { ok: false, message: 'Obecne hasło jest nieprawidłowe.', wrongCurrent: true }
        : { ok: false, message: this.passwordMessage(check.error) };
    }

    const { error } = await this.supabase.client.auth.updateUser({ password: newPassword });
    if (error) {
      return { ok: false, message: this.passwordMessage(error) };
    }

    // Other devices would stay signed in with the old password's sessions. Best effort only.
    try {
      await this.supabase.client.auth.signOut({ scope: 'others' });
    } catch {
      // The password is already changed; failing to end other sessions must not look like a failure.
    }
    return { ok: true };
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  /** Maps Supabase sign-up error codes to messages shown to the user. */
  private signUpMessage(error: AuthError): string {
    switch (error.code) {
      case 'user_already_exists':
      case 'email_exists':
        return 'Konto z tym adresem e-mail już istnieje. Zaloguj się.';
      case 'weak_password':
        return 'Hasło jest zbyt słabe. Użyj co najmniej 8 znaków.';
      case 'over_request_rate_limit':
      case 'over_email_send_rate_limit':
        return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
      case 'signup_disabled':
        return 'Rejestracja jest obecnie wyłączona.';
      case 'unexpected_failure':
        // Typically "Database error saving new user": the DB trigger rejected
        // the email domain (the form validates it too, this is a fallback).
        return 'Nie udało się utworzyć konta. Użyj adresu @student.agh.edu.pl.';
      default:
        return 'Nie udało się utworzyć konta. Spróbuj ponownie.';
    }
  }

  /** Maps Supabase sign-in error codes to messages shown to the user. */
  private signInMessage(error: AuthError): string {
    switch (error.code) {
      case 'invalid_credentials':
        // Supabase does not reveal whether the email or the password was wrong.
        return 'Nieprawidłowy adres e-mail lub hasło.';
      case 'email_not_confirmed':
        return 'Adres e-mail nie został potwierdzony.';
      case 'user_banned':
        return 'To konto jest zablokowane.';
      case 'over_request_rate_limit':
        return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
      default:
        return 'Nie udało się zalogować. Spróbuj ponownie.';
    }
  }

  /** Maps Supabase errors of a password change to messages shown to the user. */
  private passwordMessage(error: AuthError): string {
    switch (error.code) {
      case 'same_password':
        return 'Nowe hasło musi się różnić od obecnego.';
      case 'weak_password':
        return 'Nowe hasło jest zbyt słabe. Użyj co najmniej 8 znaków.';
      case 'over_request_rate_limit':
        return 'Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie.';
      case 'reauthentication_needed':
      case 'reauthentication_not_valid':
        return 'Zaloguj się ponownie i spróbuj jeszcze raz.';
      default:
        return 'Nie udało się zmienić hasła. Spróbuj ponownie.';
    }
  }
}