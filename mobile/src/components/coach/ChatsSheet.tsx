/* Chats: every conversation with the coach, in a bottom sheet opened from
   the Coach header. Grouped Pinned, Today, Yesterday, This week, Older
   (lib/coachThreads), each row the title, the last message on one line and
   when. A search box filters titles and messages. Tap a row to open that
   chat; its More button (or a long press) shows Rename, Pin or Unpin and
   Archive under it. The Archived switch at the bottom lists archived chats
   with Restore. The open chat is marked. Every target is 44px or more and
   every control is a labelled button, so it works by keyboard and screen
   reader too. */

import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { C, FONT, R, T } from '../../design';
import { haptic } from '../../lib/haptics';
import { archivedCount, displayTitle, groupThreads, relativeTime, relativeTimeLabel, type CoachThread } from '../../lib/coachThreads';
import { Button, LinkButton } from '../Button';
import { Icon } from '../Icon';
import { useReduceMotion } from '../motion';
import { Sheet } from '../training/Sheet';
import { CoachIcon, CoachIconButton, type CoachIconName } from './icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  threads: readonly CoachThread[];
  currentId: string | null;
  loading: boolean;
  onOpen: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onPin: (id: string, pinned: boolean) => void;
  onArchive: (id: string, archived: boolean) => void;
};

function ActionPill({ icon, label, onPress, accessibilityLabel }: { icon: CoachIconName; label: string; onPress: () => void; accessibilityLabel: string }) {
  const reduce = useReduceMotion();
  return (
    <Pressable
      onPress={() => {
        haptic.select();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        minHeight: 44,
        paddingHorizontal: 14,
        borderRadius: R.pill,
        backgroundColor: pressed ? C.pressed : C.raised,
        transform: [{ scale: pressed && !reduce ? 0.97 : 1 }],
      })}
    >
      <CoachIcon name={icon} size={18} color={C.text} />
      <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>{label}</Text>
    </Pressable>
  );
}

function RenameField({ initial, onSave, onCancel }: { initial: string; onSave: (title: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const [focused, setFocused] = useState(true);
  const clean = text.replace(/\s+/g, ' ').trim();
  return (
    <View style={{ gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
      <TextInput
        value={text}
        onChangeText={setText}
        autoFocus
        maxLength={80}
        selectTextOnFocus
        accessibilityLabel="Chat name"
        placeholder="Name this chat"
        placeholderTextColor={C.faint}
        returnKeyType="done"
        onSubmitEditing={() => clean && onSave(clean)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          { minHeight: 48, color: C.text, backgroundColor: C.bg, borderWidth: 1, borderColor: focused ? C.green : C.inputBorder, borderRadius: R.input, paddingHorizontal: 14, fontSize: 16, fontFamily: FONT.body },
          Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null,
        ]}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Button compact label="Save name" onPress={() => clean && onSave(clean)} disabled={!clean} />
        <LinkButton onPress={onCancel} accessibilityLabel="Cancel renaming">
          Cancel
        </LinkButton>
      </View>
    </View>
  );
}

function ThreadRow({
  t,
  current,
  now,
  archivedView,
  expanded,
  renaming,
  onOpen,
  onToggle,
  onStartRename,
  onRename,
  onCancelRename,
  onPin,
  onArchive,
}: {
  t: CoachThread;
  current: boolean;
  now: Date;
  archivedView: boolean;
  expanded: boolean;
  renaming: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onStartRename: () => void;
  onRename: (title: string) => void;
  onCancelRename: () => void;
  onPin: () => void;
  onArchive: () => void;
}) {
  const title = displayTitle(t);
  const when = relativeTime(t.updated_at, now);
  const preview = t.last_preview.trim() || (t.message_count ? '' : 'No messages yet');
  return (
    <View
      style={{
        borderRadius: R.tile,
        borderWidth: 1,
        borderColor: current ? C.greenBorder : 'transparent',
        backgroundColor: current ? C.greenTint : expanded ? C.surface : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Pressable
          onPress={onOpen}
          onLongPress={() => {
            haptic.select();
            onToggle();
          }}
          delayLongPress={400}
          accessibilityRole="button"
          accessibilityLabel={`${title}.${preview ? ` ${preview}.` : ''} ${relativeTimeLabel(t.updated_at, now)}.${t.pinned && !archivedView ? ' Pinned.' : ''}${current ? ' Open now.' : ''}`}
          accessibilityHint={current ? 'Closes the list' : 'Opens this chat'}
          accessibilityState={{ selected: current }}
          style={({ pressed }) => ({ flex: 1, minHeight: 60, justifyContent: 'center', gap: 2, paddingVertical: 10, paddingLeft: 12, paddingRight: 4, borderRadius: R.tile, opacity: pressed ? 0.7 : 1 })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {t.pinned && !archivedView ? <CoachIcon name="pin" size={14} color={C.muted} /> : null}
            <Text numberOfLines={1} style={[T.bodyStrong, { flexShrink: 1 }]}>
              {title}
            </Text>
            <Text style={[T.small, { marginLeft: 'auto', color: C.faint }]} numberOfLines={1}>
              {when}
            </Text>
          </View>
          {preview ? (
            <Text numberOfLines={1} style={T.meta}>
              {t.last_role === 'user' ? 'You: ' : ''}
              {preview}
            </Text>
          ) : null}
        </Pressable>
        <CoachIconButton
          icon="more"
          variant="bare"
          color={C.muted}
          expanded={expanded}
          onPress={() => {
            haptic.select();
            onToggle();
          }}
          accessibilityLabel={`${expanded ? 'Hide' : 'Show'} actions for ${title}`}
        />
      </View>
      {renaming ? (
        <RenameField initial={t.title} onSave={onRename} onCancel={onCancelRename} />
      ) : expanded ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 12, paddingBottom: 12 }}>
          {archivedView ? (
            <ActionPill icon="restore" label="Restore" onPress={onArchive} accessibilityLabel={`Restore ${title}`} />
          ) : (
            <>
              <ActionPill icon="edit" label="Rename" onPress={onStartRename} accessibilityLabel={`Rename ${title}`} />
              <ActionPill icon="pin" label={t.pinned ? 'Unpin' : 'Pin'} onPress={onPin} accessibilityLabel={`${t.pinned ? 'Unpin' : 'Pin'} ${title}`} />
              <ActionPill icon="archive" label="Archive" onPress={onArchive} accessibilityLabel={`Archive ${title}`} />
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

export function ChatsSheet({ visible, onClose, threads, currentId, loading, onOpen, onRename, onPin, onArchive }: Props) {
  const [query, setQuery] = useState('');
  const [archivedView, setArchivedView] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const now = new Date();
  const groups = useMemo(() => groupThreads(threads, new Date(), { archived: archivedView, query }), [threads, archivedView, query]);
  const nArchived = archivedCount(threads);
  const anyLive = threads.some((t) => !t.archived_at);

  const close = () => {
    setExpanded(null);
    setRenaming(null);
    setQuery('');
    setArchivedView(false);
    onClose();
  };

  const empty = !groups.length;
  let emptyText = '';
  if (empty) {
    if (query.trim()) emptyText = `No chats match "${query.trim()}".`;
    else if (archivedView) emptyText = 'Nothing archived. Archive a chat from its More button to tidy this list.';
    else if (!anyLive) emptyText = 'No chats yet. Each conversation with your coach is kept here once you send a message.';
  }

  return (
    <Sheet visible={visible} onClose={close} title={archivedView ? 'Archived chats' : 'Chats'}>
      {threads.length ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            minHeight: 48,
            paddingLeft: 14,
            paddingRight: 2,
            borderRadius: R.input,
            borderWidth: 1,
            borderColor: searchFocused ? C.green : C.inputBorder,
            backgroundColor: C.bg,
          }}
        >
          <CoachIcon name="search" size={18} color={C.muted} />
          <TextInput
            value={query}
            onChangeText={(v) => {
              setQuery(v);
              setExpanded(null);
              setRenaming(null);
            }}
            placeholder="Search chats"
            placeholderTextColor={C.faint}
            accessibilityLabel="Search chats"
            returnKeyType="search"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            style={[{ flex: 1, minWidth: 0, color: C.text, fontSize: 16, fontFamily: FONT.body, paddingVertical: 12 }, Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null]}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={({ pressed }) => ({ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.6 : 1 })}
            >
              <Icon name="close" size={18} color={C.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {loading && !threads.length ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 }} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={C.green} />
          <Text style={T.meta}>Loading your chats</Text>
        </View>
      ) : empty && emptyText ? (
        <Text style={[T.meta, { paddingVertical: 12 }]} accessibilityLiveRegion="polite">
          {emptyText}
        </Text>
      ) : null}

      {groups.map((g) => (
        <View key={g.key} style={{ gap: 4 }}>
          {archivedView ? null : (
            <Text accessibilityRole="header" style={[T.small, { color: C.muted, paddingHorizontal: 12, paddingTop: 8, paddingBottom: 2 }]}>
              {g.title}
            </Text>
          )}
          {g.threads.map((t) => (
            <ThreadRow
              key={t.id}
              t={t}
              now={now}
              current={t.id === currentId}
              archivedView={archivedView}
              expanded={expanded === t.id}
              renaming={renaming === t.id}
              onOpen={() => {
                haptic.select();
                setExpanded(null);
                setRenaming(null);
                onOpen(t.id);
              }}
              onToggle={() => {
                setRenaming(null);
                setExpanded((x) => (x === t.id ? null : t.id));
              }}
              onStartRename={() => setRenaming(t.id)}
              onRename={(title) => {
                haptic.select();
                onRename(t.id, title);
                setRenaming(null);
                setExpanded(null);
              }}
              onCancelRename={() => setRenaming(null)}
              onPin={() => {
                onPin(t.id, !t.pinned);
                setExpanded(null);
              }}
              onArchive={() => {
                onArchive(t.id, !archivedView);
                setExpanded(null);
              }}
            />
          ))}
        </View>
      ))}

      {nArchived > 0 || archivedView ? <View style={{ height: 1, backgroundColor: C.line, marginTop: 8 }} /> : null}
      {nArchived > 0 || archivedView ? (
        <Pressable
          onPress={() => {
            haptic.select();
            setArchivedView((v) => !v);
            setExpanded(null);
            setRenaming(null);
          }}
          accessibilityRole="switch"
          accessibilityState={{ checked: archivedView }}
          accessibilityLabel={archivedView ? 'Archived chats shown. Back to chats' : `Show archived chats, ${nArchived}`}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            minHeight: 52,
            paddingHorizontal: 12,
            borderRadius: R.tile,
            backgroundColor: pressed ? C.surface : 'transparent',
          })}
        >
          <CoachIcon name={archivedView ? 'chats' : 'archive'} size={20} color={C.stone} />
          <Text style={[T.bodyStrong, { flex: 1 }]}>{archivedView ? 'Back to chats' : 'Archived'}</Text>
          {archivedView ? null : <Text style={[T.small, { color: C.muted }]}>{nArchived}</Text>}
          <Icon name="chevronRight" size={18} color={C.muted} />
        </Pressable>
      ) : null}
    </Sheet>
  );
}
