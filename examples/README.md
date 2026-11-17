# Examples

- `basic/index.html` — one player with `createPlayer(video, { stream, token })`.
- `all-videos/index.html` — `auto({ stream, token })` patches hls.js once; existing player
  code is unchanged.
- `two-viewer/index.html` — a full two-player demo with a live peer map and delivery metrics.

Replace `STREAM` and `TOKEN` with a stream id and its `pk_…` token, then serve the folder:

```bash
npx serve lib/p2p/examples/basic
# or
npx serve lib/p2p/examples/all-videos
```

No API key is involved. `pk_…` is a per-stream public token.
