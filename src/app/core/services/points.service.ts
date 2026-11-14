import { inject, Service } from '@angular/core';
import { SupabaseService } from './supabase.service';

@Service()
export class PointsService {
  private readonly supabase = inject(SupabaseService);

  /** Sum of a user's points in a group (0 when there are no entries). Throws if the query fails. */
  async myTotal(groupId: string, userId: string): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('points_totals')
      .select('points')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }
    return data?.points ?? 0;
  }
}
