import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';
import { GroupService } from '../../../core/services/group.service';
import { SessionService } from '../../../core/services/session.service';

@Component({
  selector: 'app-join-group',
  imports: [
    ReactiveFormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './join-group.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class JoinGroup {
  private readonly fb = inject(FormBuilder);
  private readonly groups = inject(GroupService);
  private readonly auth = inject(AuthService);
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);

  protected readonly form = this.fb.nonNullable.group({
    // Trimmed on submit. Codes are matched exactly by the database (case-sensitive).
    code: ['', [Validators.required, Validators.maxLength(64)]],
  });

  protected readonly submitting = signal(false);
  protected readonly serverError = signal<string | null>(null);

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

    const result = await this.groups.joinGroup(this.form.controls.code.value);

    this.submitting.set(false);

    if (!result.ok) {
      this.serverError.set(result.message);
      return;
    }

    // Memberships are cached, so reload them before the group guard runs again.
    try {
      await this.session.refreshMemberships();
    } catch {
      // Cache stays empty on failure; the group guard will retry the query.
    }

    // TODO: point this at the group view once it exists.
    await this.router.navigateByUrl('/');
  }

  /** Lets a user who joined with the wrong account leave this screen. */
  protected async signOut(): Promise<void> {
    await this.auth.signOut();
    await this.router.navigateByUrl('/login');
  }
}