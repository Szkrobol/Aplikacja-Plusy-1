import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, ValidatorFn, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

// Same minimum as on the registration form.
const MIN_PASSWORD_LENGTH = 8;

/** The new password must differ from the current one. */
const differsFromCurrent: ValidatorFn = (control) => {
  if (!control.parent) {
    return null;
  }
  const current = control.parent.get('currentPassword')?.value;
  return control.value && control.value === current ? { sameAsCurrent: true } : null;
};

/** The repeated password must equal the new one. */
const matchesNewPassword: ValidatorFn = (control) => {
  if (!control.parent) {
    return null;
  }
  return control.value === control.parent.get('newPassword')?.value ? null : { mismatch: true };
};

/** Change of the signed-in user's password: current password, then the new one twice. */
@Component({
  selector: 'app-change-password',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './change-password.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChangePassword {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly minPasswordLength = MIN_PASSWORD_LENGTH;

  protected readonly form = this.fb.nonNullable.group({
    currentPassword: ['', [Validators.required]],
    newPassword: [
      '',
      [Validators.required, Validators.minLength(MIN_PASSWORD_LENGTH), differsFromCurrent],
    ],
    confirmPassword: ['', [Validators.required, matchesNewPassword]],
  });

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);
  protected readonly hidePasswords = signal(true);

  constructor() {
    // Re-check the dependent fields whenever the one they are compared with changes.
    this.form.controls.currentPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.newPassword.updateValueAndValidity());

    this.form.controls.newPassword.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.form.controls.confirmPassword.updateValueAndValidity());
  }

  protected togglePasswordVisibility(): void {
    this.hidePasswords.update((hidden) => !hidden);
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

    const { currentPassword, newPassword } = this.form.getRawValue();
    const result = await this.auth.changePassword(currentPassword, newPassword);

    this.submitting.set(false);

    if (!result.ok) {
      if (result.wrongCurrent) {
        // Shown under the field; it disappears as soon as the user edits it.
        const control = this.form.controls.currentPassword;
        control.setErrors({ incorrect: true });
        control.markAsTouched();
      } else {
        this.serverError.set(result.message);
      }
      return;
    }

    this.snackBar.open('Hasło zostało zmienione.', 'OK', { duration: 5000 });
    await this.router.navigateByUrl('/');
  }
}
