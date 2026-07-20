'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../lib/supabase-browser';

type Props = {
  tournamentId: string;
  userId: string;
  isEligible: boolean;
};

export function TournamentAnnouncementsLink({ tournamentId, userId, isEligible }: Props) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [roomId, setRoomId] = useState('');
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function refreshUnread(currentRoomId: string) {
      const { data: state } = await supabase
        .from('tournament_room_user_state')
        .select('last_read_at')
        .eq('room_id', currentRoomId)
        .eq('user_id', userId)
        .maybeSingle();

      let countQuery = supabase
        .from('tournament_room_messages')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', currentRoomId);

      if (state?.last_read_at) {
        countQuery = countQuery.gt('created_at', state.last_read_at);
      }

      const { count } = await countQuery;
      if (!cancelled) setUnreadCount(count || 0);
    }

    async function loadUnread() {
      if (!userId || !isEligible) {
        setRoomId('');
        setUnreadCount(0);
        return;
      }

      const { data: room } = await supabase
        .from('tournament_rooms')
        .select('id')
        .eq('tournament_id', tournamentId)
        .maybeSingle();

      if (cancelled || !room?.id) return;
      setRoomId(room.id);
      await refreshUnread(room.id);

      channel = supabase
        .channel(`tournament-announcement-link-${room.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tournament_room_messages',
            filter: `room_id=eq.${room.id}`,
          },
          () => {
            if (!cancelled) refreshUnread(room.id);
          }
        )
        .subscribe();
    }

    loadUnread();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [isEligible, supabase, tournamentId, userId]);

  if (!roomId || !isEligible) return null;

  return (
    <Link className="announcement-link-card" href={`/tournament/${tournamentId}/announcements`}>
      <span className="announcement-link-icon" aria-hidden="true">📣</span>
      <span className="announcement-link-copy">
        <strong>Tournament Announcements</strong>
        <small>Updates from the organizer</small>
      </span>
      {unreadCount > 0 ? (
        <span className="announcement-unread-badge" aria-label={`${unreadCount} unread announcements`}>
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      ) : (
        <span className="announcement-link-arrow" aria-hidden="true">›</span>
      )}
    </Link>
  );
}
