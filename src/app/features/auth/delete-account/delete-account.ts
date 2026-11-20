import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { SessionService } from '../../../core/services/session.service';

/**
 * Permanent deletion of the signed-in user's account. The user has to enter the password and
 * confirm that they understand the consequences. Group admins cannot delete their account here
 * (the database refuses it too), so the form is replaced by an explanation for them.
 */
@Component({
  selector: 'app-delete-account',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatCheckboxModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './delete-account.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteAccount {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly form = this.fb.nonNullable.group({
    password: ['', [Validators.required]],
    understood: [false, [Validators.requiredTrue]],
  });

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly hidePassword = signal(true);
  /** True for a group admin: such an account cannot be deleted from the app. */
  protected readonly blockedAdmin = signal(false);

  constructor() {
    void this.checkAdmin();
  }

  /** Only improves the screen: the database refuses an admin's request anyway. */
  private async checkAdmin(): Promise<void> {
    try {
      const memberships = await this.session.ensureMemberships();
      this.blockedAdmin.set(memberships.some((membership) => membership.role === 'admin'));
    } catch {
      // Not critical, the server decides.
    }
  }

  protected togglePasswordVisibility(): void {
    this.hidePassword.update((hidden) => !hidden);
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    this.serverError.set(null);

    const result = await this.auth.deleteAccount(this.form.controls.password.value);

    this.submitting.set(false);

    if (!result.ok) {
      if (result.wrongPassword) {
        // Shown under the field; it disappears as soon as the user edits it.
        const control = this.form.controls.password;
        control.setErrors({ incorrect: true });
        control.markAsTouched();
      } else {
        this.serverError.set(result.message);
      }
      return;
    }

    this.snackBar.open('Konto zostało usunięte.', 'OK', { duration: 8000 });
    await this.router.navigateByUrl('/login');
  }
}
