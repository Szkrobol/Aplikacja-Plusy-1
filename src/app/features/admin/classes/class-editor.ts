import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxChange, MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  CLASS_STATUS_CHIP,
  CLASS_STATUS_EFFECTS,
  CLASS_STATUS_LABELS,
  CLASS_STATUSES,
  ClassStatus,
  isRoundOpen,
} from '../../../core/class-status';
import { formatDay, fromDatetimeLocal, toDatetimeLocal } from '../../../core/date-utils';
import { plural } from '../../../core/plural';
import { ClassRow, ClassService } from '../../../core/services/class.service';
import { SessionService } from '../../../core/services/session.service';
import { TaskSetService, TaskSetSummary } from '../../../core/services/task-set.service';
import { ConfirmService } from '../../../shared/confirm-dialog/confirm.service';

const NOT_FOUND_CODE = 'PGRST116'; // `.single()` matched no row (missing id or hidden by RLS)

/**
 * Editor for one class: date, deadline, task sets and status.
 * Every change is written to the database immediately (the date and deadline on "Zapisz").
 */
@Component({
  selector: 'app-class-editor',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatCheckboxModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './class-editor.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassEditor {
  private readonly fb = inject(FormBuilder);
  private readonly session = inject(SessionService);
  private readonly classes = inject(ClassService);
  private readonly taskSets = inject(TaskSetService);
  private readonly confirmService = inject(ConfirmService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly router = inject(Router);
  private readonly classId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly statuses = CLASS_STATUSES;
  protected readonly statusLabels = CLASS_STATUS_LABELS;
  protected readonly statusChip = CLASS_STATUS_CHIP;
  protected readonly formatDay = formatDay;
  protected readonly plural = plural;

  protected readonly loading = signal(true);
  protected readonly loadError = signal<'not-found' | 'failed' | null>(null);
  /** True while a write is running; editing controls are disabled meanwhile. */
  protected readonly busy = signal(false);

  protected readonly row = signal<ClassRow | null>(null);
  protected readonly availableSets = signal<TaskSetSummary[]>([]);
  protected readonly selectedSetIds = signal<ReadonlySet<string>>(new Set());

  protected readonly detailsForm = this.fb.nonNullable.group({
    date: ['', [Validators.required]],
    /** `datetime-local` value; empty means no deadline. */
    deadline: [''],
  });

  protected readonly statusControl = this.fb.nonNullable.control<ClassStatus>('draft');

  constructor() {
    void this.loadInitial();
  }

  // ----- Loading -----

  protected async loadInitial(): Promise<void> {
    const group = this.session.activeGroup();
    if (!group) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const [detail, sets] = await Promise.all([
        this.classes.get(this.classId),
        this.taskSets.list(group.groupId),
      ]);

      this.row.set(detail.row);
      this.selectedSetIds.set(new Set(detail.taskSetIds));
      this.availableSets.set(sets);
      this.detailsForm.reset({
        date: detail.row.date,
        deadline: toDatetimeLocal(detail.row.declarations_deadline),
      });
      this.statusControl.setValue(detail.row.status);
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.loadError.set(code === NOT_FOUND_CODE ? 'not-found' : 'failed');
    } finally {
      this.loading.set(false);
    }
  }

  // ----- Date and deadline -----

  protected async saveDetails(): Promise<void> {
    if (this.detailsForm.invalid) {
      this.detailsForm.markAllAsTouched();
      return;
    }

    const { date, deadline } = this.detailsForm.getRawValue();
    const deadlineIso = fromDatetimeLocal(deadline);
    if (deadline && deadlineIso === null) {
      this.detailsForm.controls.deadline.setErrors({ invalid: true });
      return;
    }

    const saved = await this.run(
      () => this.classes.update(this.classId, { date, declarationsDeadline: deadlineIso }),
      'Nie udało się zapisać zmian.',
    );
    if (saved) {
      this.row.update((row) =>
        row ? { ...row, date, declarations_deadline: deadlineIso } : row,
      );
      this.detailsForm.reset({ date, deadline });
    }
  }

  // ----- Task sets -----

  protected isSelected(setId: string): boolean {
    return this.selectedSetIds().has(setId);
  }

  protected async toggleSet(set: TaskSetSummary, event: MatCheckboxChange): Promise<void> {
    const add = event.checked;

    // Students can already see a class that is not a draft, so ask before hiding a set.
    if (!add && this.row()?.status !== 'draft') {
      const confirmed = await this.confirmService.confirm({
        title: 'Usunąć zestaw z zajęć?',
        message:
          `Zajęcia są widoczne dla studentów. Podpunkty zestawu „${set.name}” znikną z tych zajęć, ` +
          'a istniejące zgłoszenia do nich zostaną w bazie.',
        confirmLabel: 'Usuń',
      });
      if (!confirmed) {
        event.source.checked = true;
        return;
      }
    }

    const saved = await this.run(
      () =>
        add
          ? this.classes.addTaskSet(this.classId, set.id)
          : this.classes.removeTaskSet(this.classId, set.id),
      'Nie udało się zmienić zestawów.',
    );

    if (!saved) {
      event.source.checked = !add; // put the checkbox back
      return;
    }

    this.selectedSetIds.update((previous) => {
      const next = new Set(previous);
      if (add) {
        next.add(set.id);
      } else {
        next.delete(set.id);
      }
      return next;
    });
  }

  // ----- Status -----

  protected async changeStatus(): Promise<void> {
    const current = this.row()?.status;
    const target = this.statusControl.value;
    if (!current || target === current) {
      return;
    }

    if (isRoundOpen(target) && this.selectedSetIds().size === 0) {
      this.snackBar.open('Najpierw wybierz co najmniej jeden zestaw zadań.', 'OK', {
        duration: 5000,
      });
      return;
    }

    const confirmed = await this.confirmService.confirm({
      title: `Zmienić status na „${CLASS_STATUS_LABELS[target]}”?`,
      message: CLASS_STATUS_EFFECTS[target],
      confirmLabel: 'Zmień',
    });
    if (!confirmed) {
      return;
    }

    const saved = await this.run(
      () => this.classes.setStatus(this.classId, target),
      'Nie udało się zmienić statusu.',
    );
    if (saved) {
      this.row.update((row) => (row ? { ...row, status: target } : row));
    }
  }

  // ----- Delete -----

  protected async remove(): Promise<void> {
    const row = this.row();
    if (!row) {
      return;
    }

    const confirmed = await this.confirmService.confirm({
      title: 'Usunąć zajęcia?',
      message:
        `Zajęcia z dnia ${formatDay(row.date)} zostaną usunięte razem ze zgłoszeniami i przydziałami. ` +
        'Przyznane plusy zostaną zachowane, ale stracą powiązanie z tymi zajęciami.',
      confirmLabel: 'Usuń',
    });
    if (!confirmed) {
      return;
    }

    const removed = await this.run(
      () => this.classes.remove(this.classId),
      'Nie udało się usunąć zajęć.',
    );
    if (removed) {
      await this.router.navigateByUrl('/admin/classes');
    }
  }

  // ----- Helpers -----

  /** Runs a write with the busy flag set. Returns false (and shows a message) on failure. */
  private async run(action: () => Promise<void>, errorMessage: string): Promise<boolean> {
    if (this.busy()) {
      return false;
    }

    this.busy.set(true);
    try {
      await action();
      return true;
    } catch {
      this.snackBar.open(errorMessage, 'OK', { duration: 5000 });
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
