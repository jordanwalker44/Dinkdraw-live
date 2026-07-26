'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../../../components/TopNav';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';
import { sendTournamentPushEvent } from '../../../../lib/tournament-push';

type Room = {
  id: string;
  tournament_id: string;
  posting_mode: string;
  conversation_closes_at: string | null;
  conversation_closed_at: string | null;
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
  const [profileNames, setProfileNames] = useState<Record<string, string>>({});
  const [blockedUsers, setBlockedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [restrictedUsers, setRestrictedUsers] = useState<Array<{ id: string; name: string }>>([]);
  const [isPostingRestricted, setIsPostingRestricted] = useState(false);
  const [draft, setDraft] = useState('');
  const [conversationDraft, setConversationDraft] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isPosting, setIsPosting] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [isChangingMode, setIsChangingMode] = useState(false);
  const [acceptedGuidelines, setAcceptedGuidelines] = useState(false);
  const [message, setMessage] = useState('');

  const isManager =
    !!userId &&
    !!tournament &&
    (tournament.organizer_user_id === userId || tournament.co_organizer_user_id === userId);
  const isOrganizer = !!userId && tournament?.organizer_user_id === userId;
  const isConversation =
    room?.posting_mode === 'conversation' &&
    !room.conversation_closed_at;
  const isConversationOpen =
    isConversation &&
    (!room?.conversation_closes_at ||
      new Date(room.conversation_closes_at).getTime() > Date.now());

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

    const loadedMessages = (data || []) as Announcement[];
    setAnnouncements(loadedMessages);

    const senderIds = Array.from(
      new Set(
        loadedMessages
          .map((item) => item.sender_user_id)
          .filter((id): id is string => !!id)
      )
    );

    if (!senderIds.length) {
      setProfileNames({});
      return;
    }

    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, display_name')
      .in('id', senderIds);

    setProfileNames(
      Object.fromEntries(
        (profiles || []).map((profile) => [
          profile.id,
          profile.display_name?.trim() || 'Player',
        ])
      )
    );
  }, [supabase]);

  const loadBlockedUsers = useCallback(async (currentUserId: string) => {
    const { data: blocks } = await supabase
      .from('user_blocks')
      .select('blocked_user_id')
      .eq('blocker_user_id', currentUserId);

    const blockedIds = (blocks || []).map((block) => block.blocked_user_id);
    if (!blockedIds.length) {
      setBlockedUsers([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, display_name')
      .in('id', blockedIds);
    const names = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        profile.display_name?.trim() || 'Player',
      ])
    );

    setBlockedUsers(
      blockedIds.map((id) => ({ id, name: names.get(id) || 'Player' }))
    );
  }, [supabase]);

  const loadPostingRestrictions = useCallback(async (roomId: string, currentUserId: string) => {
    const { data, error } = await supabase
      .from('tournament_room_posting_restrictions')
      .select('user_id')
      .eq('room_id', roomId);

    if (error) {
      setMessage(error.message);
      return;
    }

    const restrictedIds = (data || []).map((restriction) => restriction.user_id);
    setIsPostingRestricted(restrictedIds.includes(currentUserId));

    if (!restrictedIds.length) {
      setRestrictedUsers([]);
      return;
    }

    const { data: profiles } = await supabase
      .from('public_profiles')
      .select('id, display_name')
      .in('id', restrictedIds);
    const names = new Map(
      (profiles || []).map((profile) => [
        profile.id,
        profile.display_name?.trim() || 'Player',
      ])
    );

    setRestrictedUsers(
      restrictedIds.map((id) => ({ id, name: names.get(id) || 'Player' }))
    );
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
        .select('id, tournament_id, posting_mode, conversation_closes_at, conversation_closed_at')
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
      await loadBlockedUsers(currentUserId);
      await loadPostingRestrictions(loadedRoom.id, currentUserId);
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
            await loadPostingRestrictions(loadedRoom.id, currentUserId);
            await markRead(loadedRoom.id, currentUserId);
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'tournament_rooms',
            filter: `id=eq.${loadedRoom.id}`,
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
  }, [loadAnnouncements, loadBlockedUsers, loadPostingRestrictions, markRead, params.id, supabase]);

  async function postAnnouncement() {
    if (!room || !draft.trim()) return;

    setIsPosting(true);
    setMessage('');

    const { data, error } = await supabase.rpc('post_tournament_announcement', {
      p_room_id: room.id,
      p_body: draft.trim(),
    });

    setIsPosting(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setDraft('');
    const postedAnnouncement = Array.isArray(data) ? data[0] : data;
    if (postedAnnouncement?.id) {
      await sendTournamentPushEvent(supabase, {
        eventType: 'announcement_posted',
        tournamentId: params.id,
        messageId: postedAnnouncement.id,
      });
    }
    await loadAnnouncements(room.id);
    await markRead(room.id, userId);
  }

  async function postConversationMessage() {
    if (!room || !conversationDraft.trim() || !isConversationOpen) return;

    setIsSendingMessage(true);
    setMessage('');

    const { error } = await supabase.rpc('post_tournament_room_message', {
      p_room_id: room.id,
      p_body: conversationDraft.trim(),
    });

    setIsSendingMessage(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setConversationDraft('');
    await loadAnnouncements(room.id);
    await markRead(room.id, userId);
  }

  async function changeConversationMode(enabled: boolean) {
    if (!room || !isOrganizer) return;

    const confirmed = window.confirm(
      enabled
        ? 'Enable group conversation? Claimed players will be able to send text messages in this tournament room.'
        : 'Return this room to announcements only? Players will immediately lose the ability to send messages.'
    );
    if (!confirmed) return;

    setIsChangingMode(true);
    setMessage('');

    const { error } = await supabase.rpc('set_tournament_room_conversation', {
      p_room_id: room.id,
      p_enabled: enabled,
    });

    setIsChangingMode(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    const { data: updatedRoom } = await supabase
      .from('tournament_rooms')
      .select('id, tournament_id, posting_mode, conversation_closes_at, conversation_closed_at')
      .eq('id', room.id)
      .maybeSingle();
    if (updatedRoom) setRoom(updatedRoom as Room);
    setMessage(
      enabled
        ? 'Group conversation is now open to claimed players.'
        : 'This room is now announcements only.'
    );
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

  async function deleteRoomMessage(item: Announcement) {
    const canDelete =
      isManager ||
      (item.message_type === 'message' && item.sender_user_id === userId);
    if (!room || !canDelete) return;

    const confirmed = window.confirm(
      item.message_type === 'announcement'
        ? 'Delete this announcement?'
        : item.sender_user_id === userId
          ? 'Delete your message?'
          : 'Remove this player message from the room?'
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc('delete_tournament_room_message', {
      p_message_id: item.id,
      p_reason: isManager && item.sender_user_id !== userId
        ? 'Removed by a tournament organizer.'
        : null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setAnnouncements((current) => current.filter((messageItem) => messageItem.id !== item.id));
  }

  async function reportRoomMessage(item: Announcement) {
    if (!item.sender_user_id || item.sender_user_id === userId) return;

    const reason = window.prompt(
      'Report reason: harassment, spam, inappropriate, privacy, safety, or other',
      'inappropriate'
    );
    if (reason === null) return;

    const normalizedReason = reason.trim().toLowerCase();
    const allowedReasons = ['harassment', 'spam', 'inappropriate', 'privacy', 'safety', 'other'];
    if (!allowedReasons.includes(normalizedReason)) {
      setMessage('Choose one of the listed report reasons.');
      return;
    }

    const details = window.prompt(
      'Optional: briefly explain the concern. Do not include sensitive personal information.',
      ''
    );
    if (details === null) return;

    const { error } = await supabase.rpc('report_tournament_room_message', {
      p_message_id: item.id,
      p_reason: normalizedReason,
      p_details: details.trim() || null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessage('Report submitted for review.');
  }

  async function blockRoomUser(item: Announcement) {
    if (!item.sender_user_id || item.sender_user_id === userId) return;

    const name = profileNames[item.sender_user_id] || 'this player';
    if (!window.confirm(`Block ${name}? Their player messages will be hidden from you.`)) return;

    const { error } = await supabase.rpc('block_tournament_room_user', {
      p_blocked_user_id: item.sender_user_id,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadBlockedUsers(userId);
    await loadAnnouncements(room?.id || '');
    setMessage(`${name}'s player messages are now hidden.`);
  }

  async function unblockRoomUser(blockedUserId: string) {
    const { error } = await supabase.rpc('unblock_tournament_room_user', {
      p_blocked_user_id: blockedUserId,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadBlockedUsers(userId);
    await loadAnnouncements(room?.id || '');
    setMessage('Player unblocked.');
  }

  async function changePostingRestriction(targetUserId: string, restricted: boolean) {
    if (!room || !isManager) return;

    const name = profileNames[targetUserId] || 'this player';
    const confirmed = window.confirm(
      restricted
        ? `Restrict ${name} from posting in this tournament conversation? They will still be able to read messages and official announcements.`
        : `Allow ${name} to post in this tournament conversation again?`
    );
    if (!confirmed) return;

    const { error } = await supabase.rpc('set_tournament_room_posting_restriction', {
      p_room_id: room.id,
      p_user_id: targetUserId,
      p_restricted: restricted,
      p_reason: restricted ? 'Restricted by a tournament organizer.' : null,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPostingRestrictions(room.id, userId);
    setMessage(
      restricted
        ? `${name} can still read this room but cannot post.`
        : `${name} can post in this room again.`
    );
  }

  function senderLabel(announcement: Announcement) {
    if (announcement.sender_user_id === tournament?.organizer_user_id) return 'Organizer';
    if (announcement.sender_user_id === tournament?.co_organizer_user_id) return 'Co-organizer';
    if (announcement.sender_user_id === userId) return 'You';
    if (announcement.sender_user_id) return profileNames[announcement.sender_user_id] || 'Player';
    return announcement.message_type === 'announcement' ? 'Tournament update' : 'Player';
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
          <h1>{isConversation ? 'Group Conversation' : 'Announcements'}</h1>
          <p>
            {tournament?.title ||
              (isConversation ? 'Private tournament conversation' : 'Tournament updates from the organizer')}
          </p>
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
          {isOrganizer ? (
            <div className="card announcement-mode-card">
              <div>
                <div className="card-title">Room permissions</div>
                <div className="card-subtitle">
                  {isConversation
                    ? 'Claimed players can send text messages. Organizers can still post official announcements.'
                    : 'Only organizers can post. Claimed players can read official updates.'}
                </div>
              </div>
              <button
                type="button"
                className={isConversation ? 'button secondary' : 'button primary'}
                disabled={isChangingMode}
                onClick={() => changeConversationMode(!isConversation)}
              >
                {isChangingMode
                  ? 'Saving…'
                  : isConversation
                    ? 'Use Announcements Only'
                    : 'Enable Group Conversation'}
              </button>
            </div>
          ) : null}

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
          ) : !isConversation ? (
            <div className="notice announcement-read-only">
              This room is read-only. Updates are posted by the tournament organizers.
            </div>
          ) : null}

          {isConversationOpen && !isPostingRestricted ? (
            <div className="card conversation-composer">
              <label className="label" htmlFor="conversation-body">Message the group</label>
              <textarea
                id="conversation-body"
                className="input conversation-textarea"
                value={conversationDraft}
                onChange={(event) => setConversationDraft(event.target.value)}
                maxLength={1000}
                placeholder="Send a message to the claimed players and organizers…"
              />
              <div className="announcement-composer-footer">
                <span>{conversationDraft.length}/1000</span>
                <button
                  type="button"
                  className="button primary"
                  disabled={
                    isSendingMessage ||
                    !conversationDraft.trim() ||
                    !acceptedGuidelines
                  }
                  onClick={postConversationMessage}
                >
                  {isSendingMessage ? 'Sending…' : 'Send Message'}
                </button>
              </div>
              <p className="conversation-rules">
                Keep messages about this tournament. Organizers may remove messages, and players can report or block abuse.
                {' '}
                <Link href="/community-guidelines">Community Guidelines</Link>
              </p>
              <label className="conversation-guidelines-check">
                <input
                  type="checkbox"
                  checked={acceptedGuidelines}
                  onChange={(event) => setAcceptedGuidelines(event.target.checked)}
                />
                <span>
                  I agree to follow the <Link href="/community-guidelines">Community Guidelines</Link>.
                </span>
              </label>
            </div>
          ) : isConversationOpen && isPostingRestricted ? (
            <div className="notice announcement-read-only">
              You can read this conversation, but posting is currently unavailable.
            </div>
          ) : isConversation ? (
            <div className="notice announcement-read-only">
              This conversation is now read-only. Previous messages remain available.
            </div>
          ) : null}

          {isManager && restrictedUsers.length > 0 ? (
            <details className="card conversation-blocked">
              <summary>Posting restrictions ({restrictedUsers.length})</summary>
              <div className="conversation-blocked-list">
                {restrictedUsers.map((restrictedUser) => (
                  <div key={restrictedUser.id}>
                    <span>{restrictedUser.name}</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => changePostingRestriction(restrictedUser.id, false)}
                    >
                      Allow Posting
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          {blockedUsers.length > 0 ? (
            <details className="card conversation-blocked">
              <summary>Blocked players ({blockedUsers.length})</summary>
              <div className="conversation-blocked-list">
                {blockedUsers.map((blockedUser) => (
                  <div key={blockedUser.id}>
                    <span>{blockedUser.name}</span>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => unblockRoomUser(blockedUser.id)}
                    >
                      Unblock
                    </button>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <div className="announcement-list" aria-live="polite">
            {announcements.length === 0 ? (
              <div className="card announcement-empty">
                <span aria-hidden="true">{isConversation ? '💬' : '📣'}</span>
                <strong>{isConversation ? 'No messages yet' : 'No announcements yet'}</strong>
                <p>
                  {isConversation
                    ? 'Start the tournament conversation above.'
                    : 'Organizer updates will appear here.'}
                </p>
              </div>
            ) : (
              [...announcements].reverse().map((announcement) => (
                <article
                  className={`card announcement-item ${
                    announcement.message_type === 'message' ? 'conversation-item' : ''
                  }`}
                  key={announcement.id}
                >
                  <div className="announcement-meta">
                    <strong>
                      {announcement.message_type === 'announcement' ? '📣 ' : ''}
                      {senderLabel(announcement)}
                    </strong>
                    <time dateTime={announcement.created_at}>
                      {formatAnnouncementTime(announcement.created_at)}
                    </time>
                  </div>
                  <p>{announcement.body}</p>
                  <div className="conversation-actions">
                    {isManager ||
                    (announcement.message_type === 'message' &&
                      announcement.sender_user_id === userId) ? (
                      <button
                        type="button"
                        className="text-button danger announcement-delete"
                        onClick={() => deleteRoomMessage(announcement)}
                      >
                        {isManager && announcement.sender_user_id !== userId ? 'Remove' : 'Delete'}
                      </button>
                    ) : null}
                    {announcement.message_type === 'message' &&
                    !!announcement.sender_user_id &&
                    announcement.sender_user_id !== userId ? (
                      <>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => reportRoomMessage(announcement)}
                        >
                          Report
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() => blockRoomUser(announcement)}
                        >
                          Block
                        </button>
                      </>
                    ) : null}
                    {isManager &&
                    announcement.message_type === 'message' &&
                    !!announcement.sender_user_id &&
                    announcement.sender_user_id !== tournament?.organizer_user_id &&
                    announcement.sender_user_id !== tournament?.co_organizer_user_id &&
                    announcement.sender_user_id !== userId ? (
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={() =>
                          changePostingRestriction(
                            announcement.sender_user_id as string,
                            !restrictedUsers.some(
                              (restrictedUser) => restrictedUser.id === announcement.sender_user_id
                            )
                          )
                        }
                      >
                        {restrictedUsers.some(
                          (restrictedUser) => restrictedUser.id === announcement.sender_user_id
                        )
                          ? 'Allow Posting'
                          : 'Restrict Posting'}
                      </button>
                    ) : null}
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
