/**
 * Runtime adapter detection.
 *
 * `auto(options)` installs the hooks that are actually available on the page:
 *
 *   - hls.js        patches `Hls.prototype.loadSource`, so every player created
 *                   after this call (and the current one, if loadSource runs
 *                   later) joins the mesh.
 *   - Video.js      registers the `seedess` plugin on the global `videojs`.
 *   - dash.js       not auto-patched: it needs a Service Worker at the player
 *                   scope. Import `@seedess/p2p/dash` and call `createPlayer`.
 *
 * Native HLS (Safari/iOS) and VHS expose no seam and are never touched.
 *
 * Call `auto()` before creating players. hls.js may load later; `auto` watches
 * for it for `watchMs` (default 15s).
 */

let hlsPatched = false;
let hlsOptions = null;

function param(name) {
  try {
    return new URLSearchParams(location.search).get(name);
  } catch {
    return null;
  }
}

function hashKey(value) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** Per-player options: an explicit resolver, an explicit room, or a derived room. */
function optionsFor(url, hls) {
  const base = hlsOptions ?? {};
  if (typeof base.resolve === 'function') {
    const resolved = base.resolve(url, hls);
    if (resolved === null) return null;
    if (resolved) return { ...base, ...resolved, resolve: undefined };
  }
  const room = base.room ?? base.stream ?? param('room') ?? hashKey(String(url));
  return { ...base, room, resolve: undefined };
}

function installHls(HlsGlobal) {
  const Hls = HlsGlobal ?? globalThis.Hls;
  if (!Hls) return false;
  if (hlsPatched) return true;

  const proto = Hls.prototype;
  if (typeof proto.loadSource !== 'function') return false;
  const original = proto.loadSource;

  proto.loadSource = function loadSource(url) {
    const self = this;
    const options = optionsFor(url, self);
    if (!options) return original.call(self, url);

    // Resolve the adapter only when a player actually loads a source, so pages
    // that never play video pay no cost.
    import('@seedess/hls-p2p')
      .then(({ attach }) => {
        if (!self.seedess) self.seedess = attach(self, options);
        original.call(self, url);
      })
      .catch(() => original.call(self, url));
    return undefined;
  };

  hlsPatched = true;
  return true;
}

/**
 * Install every adapter seam available on the page.
 *
 * @param {object} [options]
 * @param {string} [options.room]        Room for a single-stream page.
 * @param {string} [options.signalingUrl]
 * @param {string} [options.configUrl]
 * @param {(url: string, player: unknown) => object|null} [options.resolve]
 *        Per-source mapping. Return `null` to leave a source untouched.
 * @param {number} [options.watchMs]     How long to wait for hls.js (default 15000).
 * @returns {{ hls: boolean, videojs: boolean }}
 */
export function auto(options = {}) {
  hlsOptions = options;
  const found = { hls: installHls(options.Hls), videojs: false };

  if (!found.hls && options.watch !== false) {
    const started = Date.now();
    const timer = setInterval(() => {
      if (installHls(options.Hls) || Date.now() - started > (options.watchMs ?? 15_000)) {
        clearInterval(timer);
      }
    }, 250);
    // Do not keep a Node process alive in tests.
    if (timer && typeof timer.unref === 'function') timer.unref();
  }

  const videojs = options.videojs ?? globalThis.videojs;
  if (videojs) {
    found.videojs = true;
    import('@seedess/videojs-p2p')
      .then(({ register }) => register(videojs))
      .catch(() => {});
  }

  return found;
}
