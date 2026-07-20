'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../../../components/TopNav';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';

type Room = {
  id: string;
  tournament_id: string;
  posting_mode: string;
};

type TournamentSummary = {
  title: string;
  organizer_user_id: string;
  co_organizer_user_id: string | null;
};

type Announcement = {
  id: string;
  room_id: string;
  sender_user_id: string | null;
  message_type: string;
  body: string;
  created_at: string;
};

function formatAnnouncementTime(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

export default function TournamentAnnouncementsPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [userId, setUserId] = useState('');
  const [room, setRoom] = useState<Room | null>(null);
  const [tournament, setTournament] = useState<TournamentSummary | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [draft, setDraft] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [message, setMessage] = useState('');

  const isManager =
    !!userId &&
    !!tournament &&
    (tournament.organizer_user_id === userId || tournament.co_organizer_user_id === userId);

  const markRead = useCallback(async (roomId: string, currentUserId: string) => {
    if (!roomId || !currentUserId) return;

    await supabase.from('tournament_room_user_state').upsert(
      {
        room_id: roomId,
        user_id: currentUserId,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: 'room_id,user_id' }
    );
  }, [supabase]);

  const loadAnnouncements = useCallback(async (roomId: string) => {
    const { data, error } = await supabase
      .from('tournament_room_messages')
      .select('id, room_id, sender_user_id, message_type, body, created_at')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAnnouncements((data || []) as Announcement[]);
  }, [supabase]);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    async function load() {
      setIsLoading(true);
      setMessage('');

      const { data: authData } = await supabase.auth.getUser();
      const currentUserId = authData.user?.id || '';

      if (!currentUserId) {
        if (!cancelled) {
          setUserId('');
          setIsLoading(false);
        }
        return;
      }

      setUserId(currentUserId);

      const { data: roomData, error: roomError } = await supabase
        .from('tournament_rooms')
        .select('id, tournament_id, posting_mode')
        .eq('tournament_id', params.id)
        .maybeSingle();

      if (cancelled) return;

      if (roomError || !roomData) {
        setMessage(roomError?.message || 'Announcements are available only to tournament participants.');
        setIsLoading(false);
        return;
      }

      const loadedRoom = roomData as Room;
      setRoom(loadedRoom);

      const [{ data: tournamentData }, { data: stateData }] = await Promise.all([
        supabase
          .from('tournaments')
          .select('title, organizer_user_id, co_organizer_user_id')
          .eq('id', params.id)
          .maybeSingle(),
        supabase
          .from('tournament_room_user_state')
          .select('is_muted')
          .eq('room_id', loadedRoom.id)
          .eq('user_id', currentUserId)
          .maybeSingle(),
      ]);

      if (cancelled) return;
      setTournament((tournamentData || null) as TournamentSummary | null);
      setIsMuted(!!stateData?.is_muted);

      await loadAnnouncements(loadedRoom.id);
      await markRead(loadedRoom.id, currentUserId);

      channel = supabase
        .channel(`tournament-announcements-${loadedRoom.id}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tournament_room_messages',
            filter: `room_id=eq.${loadedRoom.id}`,
          },
          async () => {
            await loadAnnouncements(loadedRoom.id);
            await markRead(loadedRoom.id, currentUserId);
          }
        )
        .subscribe();

      if (!cancelled) setIsLoading(false);
    }

    load();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [loadAnnouncements, markRead, params.id, supabase]);

  async function postAnnouncement() {
    if (!room || !draft.trim()) return;

    setIsPosting(true);
    setMessage('');

    const { error } = await supabase.rpc('post_tournament_announcement', {
      p_room_id: room.id,
      p_body: draft.trim(),
    });

    setIsPosting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setDraft('');
    await loadAnnouncements(room.id);
    await markRead(room.id, userId);
  }

  async function toggleMute() {
    if (!room || !userId) return;

    const nextMuted = !isMuted;
    const { error } = await supabase.from('tournament_room_user_state').upsert(
      {
        room_id: room.id,
        user_id: userId,
        is_muted: nextMuted,
      },
      { onConflict: 'room_id,user_id' }
    );

    if (error) {
      setMessage(error.message);
      return;
    }

    setIsMuted(nextMuted);
  }

  async function deleteAnnouncement(announcementId: string) {
    if (!room || !isManager) return;

    const { error } = await supabase
      .from('tournament_room_messages')
      .delete()
      .eq('id', announcementId)
      .eq('room_id', room.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAnnouncements((current) => current.filter((item) => item.id !== announcementId));
  }

  function senderLabel(announcement: Announcement) {
    if (announcement.sender_user_id === tournament?.organizer_user_id) return 'Organizer';
    if (announcement.sender_user_id === tournament?.co_organizer_user_id) return 'Co-organizer';
    return 'Tournament update';
  }

  return (
    <main className="page-shell announcement-page">
      <TopNav />

      <Link href={`/tournament/${params.id}`} className="announcement-back-link">
        ← Back to Tournament
      </Link>

      <div className="announcement-heading">
        <div>
          <div className="eyebrow">Tournament Room</div>
          <h1>Announcements</h1>
          <p>{tournament?.title || 'Tournament updates from the organizer'}</p>
        </div>

        {room ? (
          <button type="button" className="button secondary announcement-mute" onClick={toggleMute}>
            {isMuted ? 'Unmute' : 'Mute'}
          </button>
        ) : null}
      </div>

      {message ? <div className="notice announcement-notice">{message}</div> : null}

      {isLoading ? (
        <div className="card">Loading announcements…</div>
      ) : !userId ? (
        <div className="card">
          <div className="card-title">Sign in required</div>
          <div className="card-subtitle">Tournament announcements are private to participants.</div>
          <Link className="button primary" href={`/account?redirect=${encodeURIComponent(`/tournament/${params.id}/announcements`)}`}>
            Sign In
          </Link>
        </div>
      ) : !room ? (
        <div className="card">
          <div className="card-title">Announcements unavailable</div>
          <div className="card-subtitle">
            Only the organizer, co-organizer, and players who claimed a spot can open this room.
          </div>
        </div>
      ) : (
        <>
          {isManager ? (
            <div className="card announcement-composer">
              <label className="label" htmlFor="announcement-body">New announcement</label>
              <textarea
                id="announcement-body"
                className="input announcement-textarea"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={2000}
                placeholder="Share a court update, schedule change, or reminder…"
              />
              <div className="announcement-composer-footer">
                <span>{draft.length}/2000</span>
                <button
                  type="button"
                  className="button primary"
                  disabled={isPosting || !draft.trim()}
                  onClick={postAnnouncement}
                >
                  {isPosting ? 'Posting…' : 'Post Announcement'}
                </button>
              </div>
            </div>
          ) : (
            <div className="notice announcement-read-only">
              This room is read-only. Updates are posted by the tournament organizers.
            </div>
          )}

          <div className="announcement-list" aria-live="polite">
            {announcements.length === 0 ? (
              <div className="card announcement-empty">
                <span aria-hidden="true">📣</span>
                <strong>No announcements yet</strong>
                <p>Organizer updates will appear here.</p>
              </div>
            ) : (
              [...announcements].reverse().map((announcement) => (
                <article className="card announcement-item" key={announcement.id}>
                  <div className="announcement-meta">
                    <strong>{senderLabel(announcement)}</strong>
                    <time dateTime={announcement.created_at}>
                      {formatAnnouncementTime(announcement.created_at)}
                    </time>
                  </div>
                  <p>{announcement.body}</p>
                  {isManager ? (
                    <button
                      type="button"
                      className="text-button danger announcement-delete"
                      onClick={() => deleteAnnouncement(announcement.id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}

