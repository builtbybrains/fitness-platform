/* The form tutorial sheet for an exercise. With a curated video
   (data/exerciseVideos.ts) a tap opens a sheet with the video playing inline,
   its title and channel, and a link out to YouTube. Without one it opens a
   YouTube search for a form tutorial instead. The tiles that open it live in
   ExerciseTutorial.tsx. */

import React, { useCallback, useState } from 'react';
import { Linking, Text, View } from 'react-native';

import { C, FONT, T } from '../../design';
import { ExerciseVideo, exerciseVideo, VideoTarget, videoLength, watchAction, watchUrl } from '../../data/exerciseVideos';
import { LinkButton } from '../Button';
import { Icon } from '../Icon';
import { Sheet } from './Sheet';
import { VideoPlayer } from './VideoPlayer';

export { exerciseVideo };
export type { VideoTarget };

function openExternal(url: string) {
  Linking.openURL(url).catch(() => {});
}

/** State for one video sheet per screen: `watch(ex)` opens the sheet, or
    the YouTube search when nothing is curated. Render `sheet` once. */
export function useExerciseVideo() {
  const [current, setCurrent] = useState<{ ex: VideoTarget; video: ExerciseVideo } | null>(null);
  const watch = useCallback((ex: VideoTarget) => {
    const action = watchAction(ex);
    if (action.kind === 'sheet') setCurrent({ ex, video: action.video });
    else openExternal(action.url);
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
  const length = videoLength(video.seconds);
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
