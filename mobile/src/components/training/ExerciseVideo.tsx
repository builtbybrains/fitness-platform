/* "Watch how": a form tutorial for an exercise. With a curated video
   (data/exerciseVideos.ts) it opens a sheet with the video playing inline,
   its title and channel, and a link out to YouTube. Without one it opens a
   YouTube search for a form tutorial instead, and says so ("Find a video"). */

import React, { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { C, FONT, T } from '../../design';
import { ExerciseVideo, searchUrlFor, videoFor, watchUrl } from '../../data/exerciseVideos';
import { Button, IconButton, LinkButton } from '../Button';
import { Icon } from '../Icon';
import { Sheet } from './Sheet';
import { VideoPlayer } from './VideoPlayer';

export type VideoTarget = { id?: string | null; name: string };

export function exerciseVideo(ex: VideoTarget): ExerciseVideo | null {
  return videoFor(ex.id) ?? videoFor(ex.name);
}

function openExternal(url: string) {
  Linking.openURL(url).catch(() => {});
}

function mmss(sec: number | null): string | null {
  if (!sec) return null;
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

/** State for one video sheet per screen: `watch(ex)` opens the sheet, or
    the YouTube search when nothing is curated. Render `sheet` once. */
export function useExerciseVideo() {
  const [current, setCurrent] = useState<{ ex: VideoTarget; video: ExerciseVideo } | null>(null);
  const watch = useCallback((ex: VideoTarget) => {
    const video = exerciseVideo(ex);
    if (video) setCurrent({ ex, video });
    else openExternal(searchUrlFor(ex.name));
  }, []);
  const sheet = <ExerciseVideoSheet target={current} onClose={() => setCurrent(null)} />;
  return { watch, sheet };
}

function ExerciseVideoSheet({ target, onClose }: { target: { ex: VideoTarget; video: ExerciseVideo } | null; onClose: () => void }) {
  // Keep the last video while the sheet slides away.
  const [shown, setShown] = useState(target);
  if (target && target !== shown) setShown(target);
  const t = target ?? shown;
  if (!t) return null;
  const { ex, video } = t;
  const length = mmss(video.seconds);
  return (
    <Sheet visible={!!target} onClose={onClose} title={ex.name} subtitle="How to do it, step by step.">
      {target ? <VideoPlayer videoId={video.videoId} title={video.title} /> : <View style={{ width: '100%', aspectRatio: 16 / 9 }} />}
      <View style={{ gap: 4 }}>
        <Text style={T.bodyStrong}>{video.title}</Text>
        <Text style={T.small}>
          {video.channel}
          {length ? ` · ${length}` : ''}
        </Text>
      </View>
      <LinkButton align="flex-start" onPress={() => openExternal(watchUrl(video.videoId))} accessibilityLabel={`Open ${video.title} in YouTube`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.text }}>Open in YouTube</Text>
          <Icon name="arrowRight" size={16} color={C.muted} />
        </View>
      </LinkButton>
      <Text style={[T.small, { color: C.faint }]}>Video from YouTube. Stop if anything hurts.</Text>
    </Sheet>
  );
}

/** The 44px "Watch how" pill (play icon and label) under an exercise. */
export function WatchHowButton({ exercise, onWatch }: { exercise: VideoTarget; onWatch: (ex: VideoTarget) => void }) {
  const has = !!exerciseVideo(exercise);
  return (
    <Button
      compact
      variant="secondary"
      icon="play"
      label={has ? 'Watch how' : 'Find a video'}
      onPress={() => onWatch(exercise)}
      accessibilityLabel={has ? `Watch how to do ${exercise.name}` : `Find a video of ${exercise.name} on YouTube`}
      accessibilityHint={has ? undefined : 'Opens a YouTube search'}
      style={{ alignSelf: 'flex-start' }}
    />
  );
}

/** Icon-only version for tight rows (the replace-exercise sheet). */
export function WatchHowIcon({ exercise, onWatch }: { exercise: VideoTarget; onWatch: (ex: VideoTarget) => void }) {
  const has = !!exerciseVideo(exercise);
  return (
    <IconButton
      icon="play"
      variant="carbon"
      onPress={() => onWatch(exercise)}
      accessibilityLabel={has ? `Watch how to do ${exercise.name}` : `Find a video of ${exercise.name} on YouTube`}
    />
  );
}
