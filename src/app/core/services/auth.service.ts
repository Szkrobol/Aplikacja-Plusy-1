import { inject, Service } from '@angular/core';
import { AuthError, Session } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';

export type SignUpResult =
  | { ok: true; session: Session | null }
  | { ok: false; message: string };

@Service()
export class AuthService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Creates a new account. With "Confirm email" disabled in Supabase,
   * the returned session is set immediately and the user is already signed in.
   */
  async signUp(email: string, password: string): Promise<SignUpResult> {
    const { data, error } = await this.supabase.client.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
    });

    if (error) {
      return { ok: false, message: this.toMessage(error) };
    }
    return { ok: true, session: data.session };
  }

  /** Maps Supabase error codes to messages shown to the user. */
  private toMessage(error: AuthError): string {
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
}
