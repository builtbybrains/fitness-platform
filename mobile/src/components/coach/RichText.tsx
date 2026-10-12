/* The coach's reply as safe rich text: paragraphs, **bold** and lists,
   parsed by lib/richText (no HTML, no links). `limit` shows only the first
   N words, for the typewriter reveal. */

import React, { memo, useMemo } from 'react';
import { Text, View } from 'react-native';

import { C, FONT, T } from '../../design';
import { parseRichText, truncateBlocks, type Block, type Span } from '../../lib/richText';

const BODY = [T.body, { color: C.stone }];

function Spans({ spans }: { spans: readonly Span[] }) {
  return (
    <>
      {spans.map((s, i) =>
        s.bold ? (
          <Text key={i} style={{ fontFamily: FONT.bodySemi, color: C.text }}>
            {s.text}
          </Text>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </>
  );
}

function ListRow({ marker, spans }: { marker: string; spans: readonly Span[] }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingRight: 4 }}>
      <Text style={[BODY, { minWidth: marker.length > 1 ? 20 : 12, color: C.muted, fontFamily: FONT.bodySemi }]}>{marker}</Text>
      <Text style={[BODY, { flex: 1 }]} selectable={false}>
        <Spans spans={spans} />
      </Text>
    </View>
  );
}

function BlockView({ block }: { block: Block }) {
  if (block.type === 'p') {
    return (
      <Text style={BODY} selectable={false}>
        <Spans spans={block.spans} />
      </Text>
    );
  }
  if (block.type === 'ul') {
    return (
      <View style={{ gap: 6 }}>
        {block.items.map((item, i) => (
          <ListRow key={i} marker={'•'} spans={item} />
        ))}
      </View>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {block.items.map((item, i) => (
        <ListRow key={i} marker={`${item.n}.`} spans={item.spans} />
      ))}
    </View>
  );
}

export const RichText = memo(function RichText({ text, limit }: { text: string; limit?: number }) {
  const blocks = useMemo(() => parseRichText(text), [text]);
  const shown = limit == null ? blocks : truncateBlocks(blocks, limit);
  return (
    <View style={{ gap: 10 }}>
      {shown.map((b, i) => (
        <BlockView key={i} block={b} />
      ))}
    </View>
  );
});
