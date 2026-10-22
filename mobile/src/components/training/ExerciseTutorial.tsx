/* The tutorial slot for an exercise. `full` is a 16:9 frame at the top of the
   open exercise card; `compact` is a 64x36 chip beside the name on collapsed
   rows and in the replace sheet. With a curated video it shows YouTube's
   thumbnail with a play button (and the length) and a tap opens the in-app
   player sheet. Without one it is a quiet "coming soon" slot whose tap opens a
   YouTube search, so there is always a way to see the move. Static: no
   shimmer, nothing loops, so Reduce Motion only drops the press scale. */

import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';

import { C, FONT, R, T } from '../../design';
import { exerciseVideo, thumbnailUrl, videoLength, VideoTarget } from '../../data/exerciseVideos';
import { Icon } from '../Icon';
import { useReduceMotion } from '../motion';

type Props = {
  exercise: VideoTarget;
  /** useExerciseVideo().watch: the sheet when a video exists, else a search. */
  onWatch: (ex: VideoTarget) => void;
  variant?: 'full' | 'compact';
};

export const COMPACT_W = 64;
const COMPACT_H = 36;

export function tutorialLabel(name: string, hasVideo: boolean): string {
  return hasVideo ? `Watch how to do ${name}` : `Tutorial coming soon for ${name}. Search YouTube`;
}

export function ExerciseTutorial({ exercise, onWatch, variant = 'full' }: Props) {
  const video = exerciseVideo(exercise);
  return variant === 'compact' ? (
    <CompactTile exercise={exercise} onWatch={onWatch} videoId={video?.videoId ?? null} />
  ) : (
    <FullTile exercise={exercise} onWatch={onWatch} videoId={video?.videoId ?? null} seconds={video?.seconds ?? null} />
  );
}

/** YouTube's still. While it loads, or if it fails offline, the frame keeps
    the surface colour and the play mark, so it never looks broken. */
function Thumb({ videoId }: { videoId: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <Image
      source={{ uri: thumbnailUrl(videoId) }}
      resizeMode="cover"
      onError={() => setFailed(true)}
      accessibilityIgnoresInvertColors
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }}
    />
  );
}

function FullTile({ exercise, onWatch, videoId, seconds }: { exercise: VideoTarget; onWatch: Props['onWatch']; videoId: string | null; seconds: number | null }) {
  const reduce = useReduceMotion();
  const frame = { width: '100%', aspectRatio: 16 / 9, borderRadius: R.tile, overflow: 'hidden', backgroundColor: C.surface } as const;

  if (videoId) {
    const length = videoLength(seconds);
    return (
      <Pressable
        onPress={() => onWatch(exercise)}
        accessibilityRole="button"
        accessibilityLabel={tutorialLabel(exercise.name, true)}
        accessibilityHint="Plays the video here"
        style={({ pressed }) => [frame, { alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed && !reduce ? 0.97 : 1 }] }]}
      >
        {({ pressed }) => (
          <>
            <Thumb videoId={videoId} />
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: pressed ? C.greenPressed : C.green,
              }}
            >
              <Icon name="play" size={24} color={C.onGreen} strokeWidth={2.4} />
            </View>
            {length ? (
              <View style={{ position: 'absolute', right: 8, bottom: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: C.bg }}>
                <Text style={{ fontFamily: FONT.bodySemi, fontSize: 12, lineHeight: 16, color: C.text, fontVariant: ['tabular-nums'] }}>{length}</Text>
              </View>
            ) : null}
          </>
        )}
      </Pressable>
    );
  }

  // Placeholder: the same frame, a still play mark, and today's search.
  return (
    <View style={[frame, { alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 }]}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={{ alignItems: 'center', gap: 8 }}>
        <View style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: C.raised }}>
          <Icon name="play" size={20} color={C.muted} />
        </View>
        <Text style={[T.meta, { color: C.stone, textAlign: 'center' }]}>Tutorial video coming soon</Text>
      </View>
      <Pressable
        onPress={() => onWatch(exercise)}
        accessibilityRole="button"
        accessibilityLabel={tutorialLabel(exercise.name, false)}
        accessibilityHint="Opens YouTube"
        style={({ pressed }) => ({
          minHeight: 44,
          paddingHorizontal: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          opacity: pressed ? 0.7 : 1,
        })}
      >
        <Text style={{ fontFamily: FONT.bodySemi, fontSize: 15, color: C.muted }}>Search YouTube</Text>
        <Icon name="arrowRight" size={16} color={C.muted} />
      </Pressable>
    </View>
  );
}

function CompactTile({ exercise, onWatch, videoId }: { exercise: VideoTarget; onWatch: Props['onWatch']; videoId: string | null }) {
  const reduce = useReduceMotion();
  // The chip is 36 tall; the target around it is 44.
  return (
    <Pressable
      onPress={() => onWatch(exercise)}
      accessibilityRole="button"
      accessibilityLabel={tutorialLabel(exercise.name, !!videoId)}
      accessibilityHint={videoId ? 'Plays the video here' : 'Opens YouTube'}
      style={({ pressed }) => ({
        width: COMPACT_W,
        height: 44,
        justifyContent: 'center',
        transform: [{ scale: pressed && !reduce ? 0.95 : 1 }],
      })}
    >
      {({ pressed }) => (
        <View
          style={{
            width: COMPACT_W,
            height: COMPACT_H,
            borderRadius: 8,
            overflow: 'hidden',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: videoId ? C.surface : pressed ? C.pressed : C.raised,
          }}
        >
          {videoId ? <Thumb videoId={videoId} /> : null}
          {videoId ? (
            <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? C.greenPressed : C.green }}>
              <Icon name="play" size={10} color={C.onGreen} strokeWidth={2.4} />
            </View>
          ) : (
            <Icon name="play" size={14} color={C.muted} />
          )}
        </View>
      )}
    </Pressable>
  );
}
