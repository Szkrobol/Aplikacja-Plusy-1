import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { plural } from '../../core/plural';
import { AssignmentService } from '../../core/services/assignment.service';
import { UserFacingError } from '../../core/user-facing-error';
import { ConfirmService } from '../../shared/confirm-dialog/confirm.service';

export interface MyAssignmentItem {
  id: string;
  /** "2.3": task number and subtask number. */
  label: string;
}

/**
 * Lets a student give up part of what they were assigned in round 1, so that others can take it
 * in round 2 (e.g. got three subtasks but wants to do only the first one).
 */
@Component({
  selector: 'app-my-assignments',
  imports: [MatButtonModule],
  templateUrl: './my-assignments.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MyAssignments {
  readonly classId = input.required<string>();
  /** The subtasks currently assigned to the student. */
  readonly items = input.required<MyAssignmentItem[]>();
  /** Emitted after a successful release, so the page can reload. */
  readonly released = output<void>();

  private readonly assignments = inject(AssignmentService);
  private readonly confirmService = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);

  protected readonly chipBase =
    'rounded-full border px-3.5 py-1.5 text-sm font-medium tabular-nums transition-colors ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-slate-900 disabled:cursor-default disabled:opacity-60';
  protected readonly chipGiveUp = 'border-red-300 bg-red-50 text-red-900';
  protected readonly chipIdle = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';

  protected readonly busy = signal(false);
  private readonly selected = signal<ReadonlySet<string>>(new Set());

  /** Selected subtasks that are still assigned (the list changes after a release). */
  private readonly chosen = computed(() => this.items().filter((item) => this.selected().has(item.id)));
  protected readonly chosenCount = computed(() => this.chosen().length);

  protected isChosen(id: string): boolean {
    return this.selected().has(id);
  }

  protected toggle(id: string): void {
    this.selected.update((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  protected async release(): Promise<void> {
    const chosen = this.chosen();
    if (chosen.length === 0 || this.busy()) {
      return;
    }

    const labels = chosen.map((item) => item.label).join(', ');
    const remaining = this.items().length - chosen.length;
    const remainingText =
      remaining > 0
        ? `Zostanie Ci ${remaining} ${plural(remaining, 'podpunkt', 'podpunkty', 'podpunktów')}.`
        : 'Nie zostanie Ci żaden podpunkt.';

    const confirmed = await this.confirmService.confirm({
      title: 'Zrezygnować z podpunktów?',
      message:
        `Zrezygnujesz z: ${labels}. ${remainingText} Zwolnią się dla innych w turze 2. ` +
        'Nie możesz tego cofnąć, ale możesz dopisać się do wolnych podpunktów jak wszyscy.',
      confirmLabel: 'Zrezygnuj',
    });
    if (!confirmed) {
      return;
    }

    this.busy.set(true);
    try {
      const ids = chosen.map((item) => item.id);
      const done = await this.assignments.release(this.classId(), ids);

      this.snackBar.open(
        done === ids.length
          ? `Zrezygnowano z: ${labels}.`
          : `Zwolniono ${done} z ${ids.length} podpunktów. Odśwież stronę, żeby zobaczyć aktualny stan.`,
        'OK',
        { duration: 6000 },
      );
      this.selected.set(new Set());
      this.released.emit();
    } catch (error) {
      const message = error instanceof UserFacingError ? error.message : 'Nie udało się zrezygnować z podpunktów.';
      this.snackBar.open(message, 'OK', { duration: 6000 });
    } finally {
      this.busy.set(false);
    }
  }
}
