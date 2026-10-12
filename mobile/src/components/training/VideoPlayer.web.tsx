/* The embedded form video on the web: YouTube's privacy-enhanced player in
   an iframe, inline at 16:9. iOS and Android use VideoPlayer.tsx. */

import React from 'react';
import { View } from 'react-native';

import { R } from '../../design';
import { embedUrl } from '../../data/exerciseVideos';

export function VideoPlayer({ videoId, title }: { videoId: string; title: string }) {
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: R.tile, overflow: 'hidden', backgroundColor: '#000' }}>
      {React.createElement('iframe', {
        src: embedUrl(videoId),
        title,
        allow: 'accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture',
        allowFullScreen: true,
        referrerPolicy: 'strict-origin-when-cross-origin',
        style: { border: 0, width: '100%', height: '100%', display: 'block' },
      })}
    </View>
  );
}
