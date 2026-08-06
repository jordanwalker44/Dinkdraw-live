'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TopNav } from '../../../../components/TopNav';
import { sendLeaguePushEvent } from '../../../../lib/league-push';
import { getSupabaseBrowserClient } from '../../../../lib/supabase-browser';

type Message = { id: string; sender_user_id: string | null; message_type: string; body: string; created_at: string };
type NotificationPreference = 'all' | 'announcements_only' | 'off';
const MESSAGE_PAGE_SIZE = 50;

export default function LeagueChatPage({ params }: { params: { id: string } }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [leagueName, setLeagueName] = useState('League Group Chat');
  const [roomId, setRoomId] = useState('');
  const [userId, setUserId] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState('');
  const [notificationPreference, setNotificationPreference] = useState<NotificationPreference>('all');
  const [hasEarlierMessages, setHasEarlierMessages] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [error, setError] = useState('');
  const [isSubstitute, setIsSubstitute] = useState(false);

  const addSenderNames = useCallback(async (loaded: Message[]) => {
    const ids = Array.from(new Set(loaded.map((item) => item.sender_user_id).filter(Boolean))) as string[];
    if (!ids.length) return;
    const profiles = await supabase.from('public_profiles').select('id, display_name').in('id', ids);
    setNames((current) => ({ ...current, ...Object.fromEntries((profiles.data || []).map((profile) => [profile.id, profile.display_name || 'Player'])) }));
  }, [supabase]);

  const loadMessages = useCallback(async (id: string) => {
    const result = await supabase.from('tournament_room_messages').select('id, sender_user_id, message_type, body, created_at')
      .eq('room_id', id).order('created_at', { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
    if (result.error) { setError(result.error.message); return; }
    const rows = (result.data || []) as Message[];
    const loaded = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();
    setHasEarlierMessages(rows.length > MESSAGE_PAGE_SIZE);
    setMessages((current) => {
      const byId = new Map([...current, ...loaded].map((item) => [item.id, item]));
      return Array.from(byId.values()).sort((a, b) => a.created_at.localeCompare(b.created_at));
    });
    await addSenderNames(loaded);
  }, [supabase, addSenderNames]);

  async function loadEarlierMessages() {
    if (!roomId || !messages.length || loadingEarlier) return;
    setLoadingEarlier(true);
    const result = await supabase.from('tournament_room_messages').select('id, sender_user_id, message_type, body, created_at')
      .eq('room_id', roomId).lt('created_at', messages[0].created_at)
      .order('created_at', { ascending: false }).limit(MESSAGE_PAGE_SIZE + 1);
    setLoadingEarlier(false);
    if (result.error) { setError(result.error.message); return; }
    const rows = (result.data || []) as Message[];
    const earlier = rows.slice(0, MESSAGE_PAGE_SIZE).reverse();
    setHasEarlierMessages(rows.length > MESSAGE_PAGE_SIZE);
    setMessages((current) => [...earlier, ...current]);
    await addSenderNames(earlier);
  }

  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    void (async () => {
      const auth = await supabase.auth.getUser(); const currentUser = auth.data.user?.id || ''; setUserId(currentUser);
      const [league, room] = await Promise.all([
        supabase.from('leagues').select('name').eq('id', params.id).maybeSingle(),
        supabase.from('tournament_rooms').select('id').eq('league_id', params.id).maybeSingle(),
      ]);
      const membership = await supabase.from('league_members').select('member_type').eq('league_id', params.id).eq('user_id', currentUser).maybeSingle();
      setIsSubstitute(membership.data?.member_type === 'substitute');
      if (league.data?.name) setLeagueName(league.data.name);
      if (!room.data) { setError(room.error?.message || 'League chat is unavailable.'); return; }
      const loadedRoomId = room.data.id;
      setRoomId(loadedRoomId); await loadMessages(loadedRoomId);
      const state = await supabase.from('tournament_room_user_state').select('notification_preference, is_muted, push_enabled').eq('room_id', loadedRoomId).eq('user_id', currentUser).maybeSingle();
      setNotificationPreference((state.data?.notification_preference as NotificationPreference | undefined) || (state.data?.is_muted || state.data?.push_enabled === false ? 'off' : 'all'));
      channel = supabase.channel(`league-chat-${loadedRoomId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_room_messages', filter: `room_id=eq.${loadedRoomId}` }, () => void loadMessages(loadedRoomId)).subscribe();
    })();
    return () => { if (channel) void supabase.removeChannel(channel); };
  }, [params.id, supabase, loadMessages]);

  async function sendMessage() {
    if (!roomId || !draft.trim()) return;
    const result = await supabase.rpc('post_tournament_room_message', { p_room_id: roomId, p_body: draft.trim() });
    if (result.error) { setError(result.error.message); return; }
    const posted = Array.isArray(result.data) ? result.data[0] : result.data; setDraft('');
    if (posted?.id) void sendLeaguePushEvent(supabase, { eventType: 'group_message_posted', leagueId: params.id, messageId: posted.id });
    await loadMessages(roomId);
  }

  async function saveNotificationPreference(next: NotificationPreference) {
    const result = await supabase.from('tournament_room_user_state').upsert({
      room_id: roomId, user_id: userId, notification_preference: next,
      is_muted: next === 'off', push_enabled: next !== 'off', updated_at: new Date().toISOString(),
    }, { onConflict: 'room_id,user_id' });
    if (result.error) { setError(result.error.message); return; }
    setNotificationPreference(next);
  }

  return <main className="page-shell"><TopNav /><Link href={`/leagues/${params.id}`}>← Back to League</Link>
    <div className="card" style={{ marginTop: 14 }}><div className="row-between"><div><div className="card-title">{leagueName}</div><div className="card-subtitle">{isSubstitute ? 'Announcements for the weeks you accepted.' : 'Season-long private group chat for regular league players.'}</div></div><div><label className="label" htmlFor="league-chat-notifications">Notifications</label><select id="league-chat-notifications" className="input" value={notificationPreference} onChange={(event) => void saveNotificationPreference(event.target.value as NotificationPreference)}><option value="all">All messages</option><option value="announcements_only">Announcements only</option><option value="off">Off</option></select></div></div></div>
    {error ? <div className="notice" style={{ marginTop: 12 }}>{error}</div> : null}
    <div className="card" style={{ marginTop: 12 }}>{hasEarlierMessages ? <button className="button secondary" type="button" disabled={loadingEarlier} onClick={() => void loadEarlierMessages()} style={{ marginBottom: 12 }}>{loadingEarlier ? 'Loading...' : 'Load Earlier Messages'}</button> : null}<div className="grid" style={{ gap: 10 }}>{messages.map((item) => <div className="notice" key={item.id}><strong>{item.sender_user_id === userId ? 'You' : names[item.sender_user_id || ''] || (item.message_type === 'announcement' ? 'Organizer' : 'Player')}</strong><div>{item.body}</div><div className="muted" style={{ fontSize: 12 }}>{new Date(item.created_at).toLocaleString()}</div></div>)}</div></div>
    {!isSubstitute ? <div className="card" style={{ marginTop: 12 }}><label className="label">Message the league</label><textarea className="input" value={draft} maxLength={1000} onChange={(event) => setDraft(event.target.value)} /><button className="button primary" disabled={!draft.trim()} onClick={sendMessage} style={{ marginTop: 8 }}>Send Message</button></div> : null}
  </main>;
}
