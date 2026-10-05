/* The embedded form video on iOS and Android: YouTube's privacy-enhanced
   player in a WebView, inline (not forced full screen). The player loads
   from a tiny page with an https origin, because YouTube refuses embeds
   that arrive with no referrer. Web uses VideoPlayer.web.tsx (an iframe). */

import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { C, R } from '../../design';
import { embedUrl } from '../../data/exerciseVideos';

const ORIGIN = 'https://builtbybrains.github.io';

export function VideoPlayer({ videoId, title }: { videoId: string; title: string }) {
  const html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;height:100%;background:#000}iframe{border:0;width:100%;height:100%}</style></head><body><iframe src="${embedUrl(videoId)}" title="${title.replace(/"/g, '&quot;')}" allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></body></html>`;
  return (
    <View style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: R.tile, overflow: 'hidden', backgroundColor: '#000' }} accessibilityLabel={`Video: ${title}`}>
      <WebView
        source={{ html, baseUrl: ORIGIN }}
        originWhitelist={['*']}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsFullscreenVideo
        javaScriptEnabled
        startInLoadingState
        renderLoading={() => (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg }}>
            <ActivityIndicator color={C.green} />
          </View>
        )}
        style={{ flex: 1, backgroundColor: '#000' }}
      />
    </View>
  );
}
