# @seedess/p2p

The universal [Seedess](https://seedess.com) entry point. It chooses the right player adapter at
runtime, or you can import a specific adapter for the smallest bundle.

Seedess makes viewers share the video segments they already watch, so the CDN carries fewer bytes.
The player stays the player.

## Install

```bash
npm install @seedess/p2p
```

Players are peer dependencies, not bundled:

```bash
npm install hls.js            # for HLS
npm install video.js          # for Video.js (with an hls.js tech)
npm install dash.js           # for DASH
```

## Universal use

```js
import Hls from 'hls.js';
import { auto } from '@seedess/p2p';

auto({
  Hls,
  room: 'demo',
  signalingUrl: 'https://seedess.com/signaling/room/demo?token=pk_…',
  configUrl: 'https://seedess.com/signaling/config?token=pk_…',
});

// Your existing player code is unchanged.
const hls = new Hls();
hls.loadSource(masterUrl);
hls.attachMedia(video);
```

`auto()` patches `Hls.prototype.loadSource`, so every hls.js player created after the call joins
the mesh. For Video.js, pass `videojs` and the `seedess` plugin is registered:

```js
import videojs from 'video.js';
import { auto } from '@seedess/p2p';

auto({ videojs, room: 'demo', signalingUrl, configUrl });
const player = videojs('player', { /* hls.js tech */ });
player.seedess({ room: 'demo', signalingUrl, configUrl });
```

## Specific adapters

```js
import { attach } from '@seedess/p2p/hls';     // hls.js
import { register } from '@seedess/p2p/videojs'; // Video.js
import { createPlayer } from '@seedess/p2p/dash'; // dash.js + Service Worker
import { SegmentMesh } from '@seedess/p2p/core';  // build your own adapter
```

## What `auto()` does and does not cover

| Player | Auto? | Notes |
| --- | --- | --- |
| hls.js | Yes | Patches `loadSource`; call before creating players. |
| Video.js | Yes | Registers the `seedess` plugin when `videojs` is passed. |
| dash.js | No | Needs a Service Worker at the player scope; use `@seedess/p2p/dash`. |
| Shaka | Not yet | Adapter planned. |
| Native HLS (Safari/iOS) | No | No interceptable network seam; playback stays on the CDN. |
| VHS | No | Video.js's bundled engine has no hls.js instance to wrap. |

`auto()` is intentionally conservative. It never claims a player it cannot wrap, and it no-ops
when the seam is missing.

## Options

`auto()` and the adapters share the same options:

| Option | Default | Meaning |
| --- | --- | --- |
| `room` | derived from the source | Swarm room. One room per identical stream. |
| `signalingUrl` | `api/swarm` | Absolute Seedess room URL. |
| `configUrl` | `api/config` | Absolute Seedess ICE/config URL. |
| `resolve` | — | `(url, player) => options \| null`; return `null` to leave a source untouched. |
| `Hls` | `globalThis.Hls` | hls.js constructor for the auto patch. |
| `videojs` | `globalThis.videojs` | Video.js instance for plugin registration. |
| `watch` / `watchMs` | `true` / `15000` | Poll for a player loaded after this script. |

Full adapter options are in [`@seedess/hls-p2p`](../hls-p2p).

## Packages

- [`@seedess/core`](../core) — mesh, signaling, verification.
- [`@seedess/hls-p2p`](../hls-p2p) — hls.js fragment loader.
- [`@seedess/videojs-p2p`](../videojs-p2p) — Video.js plugin.
- [`@seedess/dash-p2p`](../dash-p2p) — dash.js Service Worker bridge.

## License

MIT.
