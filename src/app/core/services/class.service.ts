import { inject, Service } from '@angular/core';
import { Tables } from '../database.types';
import { toIsoDate } from '../date-utils';
import { SupabaseService } from './supabase.service';

export type ClassRow = Tables<'classes'>;

@Service()
export class ClassService {
  private readonly supabase = inject(SupabaseService);

  /**
   * Classes of a group from today onwards, soonest first.
   * Drafts are only meant for admins; RLS lets every member read them, so students filter them out here.
   * Throws if the query fails.
   */
  async upcoming(groupId: string, includeDrafts: boolean, limit = 10): Promise<ClassRow[]> {
    let query = this.supabase.client
      .from('classes')
      .select('*')
      .eq('group_id', groupId)
      .gte('date', toIsoDate(new Date()));

    if (!includeDrafts) {
      query = query.neq('status', 'draft');
    }

    const { data, error } = await query.order('date', { ascending: true }).limit(limit);
    if (error) {
      throw error;
    }
    return data;
  }
}
