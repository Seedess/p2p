# Two-viewer peer demo

A working page with two players on the same stream. Viewer A starts and pulls from the CDN.
Viewer B joins the same room, starts on the CDN like a normal player, and switches to peer
segments once the WebRTC link is ready.

It uses the public demo stream (`https://seedess.com/demo/config`) and the
[`@seedess/p2p`](https://seedess.com/p2p.js) browser bundle, so the only thing you need is a
static file server.

## Run

```bash
npx serve lib/p2p/examples/two-viewer
```

Open the printed URL. No API key, no build step.

## What it shows

- per-viewer CDN bytes, peer bytes, rates, offload and segment counts
- a live peer map: nodes, a connector, and animated bytes when data flows
- combined delivery metrics

## Implement it

1. Create a stream on your server:

```bash
curl -s https://seedess.com/api/v1/streams \
  -H "Authorization: Bearer key_…" \
  -H "Content-Type: application/json" \
  -d '{"url":"https://origin.example/master.m3u8","id":"demo"}'
```

2. Play it on the page:

```js
import { createPlayer } from 'https://seedess.com/p2p.js';

const player = await createPlayer(document.querySelector('video'), {
  stream: 'demo',
  token: 'pk_…',
});

player.on('stats', console.log);
```

3. Or patch every hls.js player:

```js
import { auto } from 'https://seedess.com/p2p.js';

auto({ stream: 'demo', token: 'pk_…' });

const hls = new Hls();
hls.loadSource(masterUrl);
hls.attachMedia(video);
```

The API key stays on the server. The page only receives the per-stream public token.

## Notes

- Both videos are muted so autoplay works.
- Viewer B starts on the CDN immediately. Once it has a few segments buffered, the mesh
  prefers the peer for new segments; if the peer cannot serve one, it falls back to the CDN.
- If the peer link never opens, both players stay on the CDN. Check `/signaling/config` for
  `turn: true`; a TURN relay is required for many networks.

Docs: https://seedess.com/docs/ · API: https://seedess.com/docs/api/
