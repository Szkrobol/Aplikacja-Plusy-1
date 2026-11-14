import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
  WritableSignal,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CLASS_STATUS_CHIP, CLASS_STATUS_LABELS } from '../../core/class-status';
import { buildSets, SetView, TaskView } from '../../core/class-structure';
import { formatDateTime, formatDay } from '../../core/date-utils';
import { plural } from '../../core/plural';
import { AssignmentRow, AssignmentService } from '../../core/services/assignment.service';
import { ClassRow, ClassService } from '../../core/services/class.service';
import { DeclarationService } from '../../core/services/declaration.service';
import { GroupService } from '../../core/services/group.service';
import { SessionService } from '../../core/services/session.service';
import { AssignmentsView } from '../../shared/assignments-view/assignments-view';

const NOT_FOUND_CODE = 'PGRST116'; // `.single()` matched no row (missing id or hidden by RLS)

/** Messages for classes that are not accepting round 1 declarations right now. */
const CLOSED_MESSAGES: Record<ClassRow['status'], string> = {
  draft: '',
  round1_open: 'Termin zapisów minął. Poniżej widać podpunkty, które zgłosiłeś.',
  round2_open: 'Tura 1 jest zakończona. Poniżej widać przydział z tej tury.',
  assigned: 'Zapisy są zamknięte. Poniżej widać przydział podpunktów.',
  finished: 'Te zajęcia już się zakończyły. Poniżej widać przydział podpunktów.',
};

/**
 * A class as the student sees it. While round 1 is open it lists the task sets and subtasks,
 * where the student marks the ones they want to present (each click is saved immediately; the UI
 * updates first and rolls back if the save fails). Afterwards it shows who got which subtask.
 */
@Component({
  selector: 'app-class-detail',
  imports: [RouterLink, MatButtonModule, MatProgressSpinnerModule, AssignmentsView],
  templateUrl: './class-detail.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ClassDetail {
  private readonly session = inject(SessionService);
  private readonly classes = inject(ClassService);
  private readonly declarations = inject(DeclarationService);
  private readonly assignments = inject(AssignmentService);
  private readonly groups = inject(GroupService);
  private readonly snackBar = inject(MatSnackBar);
  private readonly classId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  protected readonly statusLabels = CLASS_STATUS_LABELS;
  protected readonly statusChip = CLASS_STATUS_CHIP;
  protected readonly closedMessages = CLOSED_MESSAGES;
  protected readonly formatDay = formatDay;
  protected readonly formatDateTime = formatDateTime;
  protected readonly plural = plural;

  protected readonly chipBase =
    'rounded-full border px-3.5 py-1.5 text-sm font-medium tabular-nums transition-colors ' +
    'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-slate-900 disabled:cursor-default disabled:opacity-60';
  protected readonly chipSelected = 'border-slate-900 bg-slate-900 text-white';
  protected readonly chipIdle = 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';

  protected readonly loading = signal(true);
  protected readonly loadError = signal<'not-found' | 'failed' | null>(null);

  protected readonly row = signal<ClassRow | null>(null);
  protected readonly sets = signal<SetView[]>([]);
  /** True while round 1 is open and the deadline has not passed. */
  protected readonly editable = signal(false);

  protected readonly assignmentRows = signal<AssignmentRow[]>([]);
  protected readonly names = signal<ReadonlyMap<string, string>>(new Map());
  protected readonly currentUserId = computed(() => this.session.user()?.id ?? null);

  private readonly selected = signal<ReadonlySet<string>>(new Set());
  /** Subtasks with a save in flight; they cannot be clicked again until it finishes. */
  private readonly pending = signal<ReadonlySet<string>>(new Set());

  /** Number of declared subtasks that are part of this class. */
  protected readonly selectedCount = computed(() => {
    const selected = this.selected();
    let count = 0;
    for (const set of this.sets()) {
      for (const task of set.tasks) {
        count += task.subtasks.filter((subtask) => selected.has(subtask.id)).length;
      }
    }
    return count;
  });

  /** Labels ("2.1") of the subtasks assigned to the current user, in order. */
  protected readonly myAssigned = computed(() => {
    const me = this.currentUserId();
    if (!me) {
      return [];
    }

    const mine = new Set(
      this.assignmentRows().filter((row) => row.userId === me).map((row) => row.subtaskId),
    );
    const labels: string[] = [];
    for (const set of this.sets()) {
      for (const task of set.tasks) {
        for (const subtask of task.subtasks) {
          if (mine.has(subtask.id)) {
            labels.push(`${task.taskNo}.${subtask.subtaskNo}`);
          }
        }
      }
    }
    return labels;
  });

  constructor() {
    void this.load();
  }

  // ----- Loading -----

  protected async load(): Promise<void> {
    const user = this.session.user();
    if (!user) {
      this.loading.set(false);
      return;
    }

    this.loading.set(true);
    this.loadError.set(null);

    try {
      const detail = await this.classes.getWithTasks(this.classId);

      // Drafts are only for admins; to students they do not exist yet.
      if (detail.row.status === 'draft' && !this.session.isAdmin()) {
        this.loadError.set('not-found');
        return;
      }

      // Assignments exist once round 1 has been assigned.
      const hasAssignments = this.showsAssignments(detail.row.status);
      const [mine, assignmentRows, names] = await Promise.all([
        this.declarations.mine(this.classId, user.id),
        hasAssignments ? this.assignments.forClass(this.classId) : Promise.resolve<AssignmentRow[]>([]),
        hasAssignments ? this.groups.members(detail.row.group_id) : Promise.resolve(new Map<string, string>()),
      ]);

      this.row.set(detail.row);
      this.sets.set(buildSets(detail.taskSets));
      this.selected.set(new Set(mine));
      this.assignmentRows.set(assignmentRows);
      this.names.set(names);
      this.editable.set(this.isRoundOneOpen(detail.row));
    } catch (error) {
      const code = (error as { code?: string }).code;
      this.loadError.set(code === NOT_FOUND_CODE ? 'not-found' : 'failed');
    } finally {
      this.loading.set(false);
    }
  }

  private showsAssignments(status: ClassRow['status']): boolean {
    return status === 'round2_open' || status === 'assigned' || status === 'finished';
  }

  private isRoundOneOpen(row: ClassRow): boolean {
    if (row.status !== 'round1_open') {
      return false;
    }
    return !row.declarations_deadline || Date.now() < new Date(row.declarations_deadline).getTime();
  }

  // ----- Template helpers -----

  protected isSelected(subtaskId: string): boolean {
    return this.selected().has(subtaskId);
  }

  protected isPending(subtaskId: string): boolean {
    return this.pending().has(subtaskId);
  }

  protected allSelected(task: TaskView): boolean {
    const selected = this.selected();
    return task.subtasks.every((subtask) => selected.has(subtask.id));
  }

  // ----- Declaring -----

  protected toggleSubtask(subtaskId: string): Promise<void> {
    return this.apply([subtaskId], !this.selected().has(subtaskId));
  }

  /** Selects every subtask of the task, or clears them all if they are already all selected. */
  protected toggleTask(task: TaskView): Promise<void> {
    const ids = task.subtasks.map((subtask) => subtask.id);
    return this.apply(ids, !this.allSelected(task));
  }

  private async apply(ids: string[], select: boolean): Promise<void> {
    const user = this.session.user();
    const row = this.row();
    if (!user || !row || !this.editable()) {
      return;
    }

    // The deadline may have passed while the page was open.
    if (!this.isRoundOneOpen(row)) {
      this.editable.set(false);
      this.snackBar.open('Zapisy zostały zamknięte.', 'OK', { duration: 5000 });
      return;
    }

    const pending = this.pending();
    if (ids.some((id) => pending.has(id))) {
      return;
    }

    // Only the subtasks whose state really changes (a task may be partly selected already).
    const changing = ids.filter((id) => this.selected().has(id) !== select);
    if (changing.length === 0) {
      return;
    }

    this.mark(this.pending, changing, true);
    this.mark(this.selected, changing, select); // optimistic update

    try {
      if (select) {
        await this.declarations.add(this.classId, user.id, changing);
      } else {
        await this.declarations.remove(this.classId, user.id, changing);
      }
    } catch {
      this.mark(this.selected, changing, !select); // roll back
      this.snackBar.open(
        select
          ? 'Nie udało się zapisać zgłoszenia. Zapisy mogły się już zamknąć.'
          : 'Nie udało się wycofać zgłoszenia. Zapisy mogły się już zamknąć.',
        'OK',
        { duration: 5000 },
      );
    } finally {
      this.mark(this.pending, changing, false);
    }
  }

  /** Adds ids to (or removes them from) a set held in a signal. */
  private mark(target: WritableSignal<ReadonlySet<string>>, ids: string[], add: boolean): void {
    target.update((previous) => {
      const next = new Set(previous);
      for (const id of ids) {
        if (add) {
          next.add(id);
        } else {
          next.delete(id);
        }
      }
      return next;
    });
  }
}