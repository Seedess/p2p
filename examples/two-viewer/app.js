/**
 * Seedess two-viewer demo.
 *
 * Viewer A starts and pulls segments from the CDN. Viewer B joins the same room,
 * waits for a peer data channel, then loads the source. Its segment requests go
 * to A first; anything A does not have falls back to the CDN.
 *
 * Metrics are the adapter's per-player counters, plus a smoothed byte rate.
 */

import { attach, createPlayer } from 'https://seedess.com/p2p.js?v=18';

const $ = (id) => document.getElementById(id);
const videoA = $('video-a');
const videoB = $('video-b');

const rates = {
  a: { last: null, p2p: 0, cdn: 0 },
  b: { last: null, p2p: 0, cdn: 0 },
};

const latest = {
  a: zeroStats(),
  b: zeroStats(),
};

let bStarted = false;
let seeded = false;
let controllerB = null;
let peerPreferred = false;

function zeroStats() {
  return {
    p2pBytes: 0,
    httpBytes: 0,
    segmentsP2P: 0,
    segmentsHttp: 0,
    fallbacks: 0,
    hashFailures: 0,
    peers: 0,
    connectedPeers: 0,
  };
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  const digits = size >= 100 ? 0 : size >= 10 ? 1 : 2;
  return `${size.toFixed(digits)} ${units[unit]}`;
}

function formatRate(value) {
  return `${formatBytes(value)}/s`;
}

function offload(stats) {
  const total = (stats.p2pBytes ?? 0) + (stats.httpBytes ?? 0);
  return total > 0 ? (stats.p2pBytes / total) * 100 : 0;
}

function setStatus(node, text, error = false) {
  node.textContent = text;
  node.classList.toggle('error', error);
}

function updateRate(key, stats) {
  const tracker = rates[key];
  const now = performance.now();
  if (tracker.last) {
    const dt = Math.max(0.001, (now - tracker.last.t) / 1000);
    const p2p = Math.max(0, (stats.p2pBytes ?? 0) - tracker.last.p2p) / dt;
    const cdn = Math.max(0, (stats.httpBytes ?? 0) - tracker.last.http) / dt;
    // Smooth across segments; the adapter emits stats per segment.
    tracker.p2p = tracker.p2p ? tracker.p2p * 0.55 + p2p * 0.45 : p2p;
    tracker.cdn = tracker.cdn ? tracker.cdn * 0.55 + cdn * 0.45 : cdn;
  }
  tracker.last = {
    t: now,
    p2p: stats.p2pBytes ?? 0,
    http: stats.httpBytes ?? 0,
  };
}

function renderViewer(key, stats) {
  latest[key] = stats;
  updateRate(key, stats);

  const prefix = key;
  const peers = stats.connectedPeers ?? stats.peers ?? 0;
  const pct = offload(stats);

  $(`${prefix}-cdn`).textContent = formatBytes(stats.httpBytes);
  $(`${prefix}-cdn-rate`).textContent = formatRate(rates[key].cdn);
  $(`${prefix}-p2p`).textContent = formatBytes(stats.p2pBytes);
  $(`${prefix}-p2p-rate`).textContent = formatRate(rates[key].p2p);
  $(`${prefix}-offload`).textContent = `${pct.toFixed(1)}%`;
  $(`${prefix}-peers`).textContent = String(peers);
  $(`${prefix}-seg-http`).textContent = String(stats.segmentsHttp ?? 0);
  $(`${prefix}-seg-p2p`).textContent = String(stats.segmentsP2P ?? 0);
  $(`${prefix}-fallbacks`).textContent = String(stats.fallbacks ?? 0);
  $(`${prefix}-hash`).textContent = String(stats.hashFailures ?? 0);

  const badge = $(`${prefix}-badge`);
  if (peers > 0) {
    badge.textContent = key === 'a' ? 'Seeding' : 'P2P';
    badge.className = 'badge badge-p2p';
  } else if (key === 'a') {
    badge.textContent = 'CDN';
    badge.className = 'badge badge-cdn';
  } else {
    badge.textContent = 'Waiting';
    badge.className = 'badge';
  }

  if (key === 'b') {
    if (!peerPreferred && controllerB && peers > 0 && (stats.segmentsHttp ?? 0) >= 3) {
      peerPreferred = true;
      controllerB.mesh.hedgeDelay = 12000;
      controllerB.mesh.haveWaitMs = 3000;
      setStatus($('b-status'), 'CDN warm-up done — preferring the peer for new segments.');
    }
    if (peers > 0 && stats.p2pBytes > 0) {
      setStatus($('b-status'), `Receiving ${pct.toFixed(1)}% of bytes from Viewer A.`);
    } else if (peers > 0) {
      setStatus($('b-status'), 'Connected to Viewer A — waiting for the first peer segment…');
    }
  }

  renderCombined();
}

function setPeerMap(connected, rate) {
  const map = $('peer-map');
  const transferring = connected && rate > 0;
  map.classList.toggle('is-connected', connected);
  map.classList.toggle('is-transferring', transferring);

  $('peer-role-a').textContent = connected ? 'Seeding' : 'CDN';
  if (!bStarted) {
    $('peer-role-b').textContent = 'Waiting';
  } else if (connected && latest.b.p2pBytes > 0) {
    $('peer-role-b').textContent = 'Receiving';
  } else if (connected) {
    $('peer-role-b').textContent = 'Connected';
  } else {
    $('peer-role-b').textContent = 'CDN fallback';
  }

  $('peer-link-label').textContent = connected
    ? rate > 0
      ? `${formatRate(rate)} peer`
      : 'WebRTC connected'
    : bStarted
      ? 'no peer link'
      : 'waiting for B';
}

function renderCombined() {
  const totalP2P = (latest.a.p2pBytes ?? 0) + (latest.b.p2pBytes ?? 0);
  const totalCdn = (latest.a.httpBytes ?? 0) + (latest.b.httpBytes ?? 0);
  const total = totalP2P + totalCdn;
  const pct = total > 0 ? (totalP2P / total) * 100 : 0;
  const rate = rates.a.p2p + rates.b.p2p;
  const peers = Math.max(
    latest.a.connectedPeers ?? latest.a.peers ?? 0,
    latest.b.connectedPeers ?? latest.b.peers ?? 0,
  );

  $('total-cdn').textContent = formatBytes(totalCdn);
  $('total-p2p').textContent = formatBytes(totalP2P);
  $('total-rate').textContent = formatRate(rate);
  $('total-peers').textContent = String(peers);
  $('total-offload').textContent = `${pct.toFixed(1)}%`;
  $('offload-bar').style.width = `${Math.min(100, pct)}%`;
  $('offload-bar-wrap').setAttribute('aria-valuenow', String(Math.round(pct)));
  setPeerMap(peers > 0, rate);

  if (seeded && peers > 0 && latest.b.p2pBytes > 0) {
    setStatus($('global-status'), 'Viewer B is feeding from Viewer A over WebRTC.');
  } else if (peers > 0) {
    setStatus($('global-status'), 'Peer link open — waiting for the first peer segment.');
  }
}

function waitForSegments(controller, count, timeoutMs = 30000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      resolve(ok);
    };
    const check = (stats) => {
      if ((stats.segmentsHttp ?? 0) + (stats.segmentsP2P ?? 0) >= count) finish(true);
    };
    let timer;
    let unsubscribe = () => {};
    unsubscribe = controller.on('stats', check);
    timer = setTimeout(() => finish(false), timeoutMs);
    check(controller.stats);
  });
}

async function start() {
  let config;
  try {
    const response = await fetch('https://seedess.com/demo/config', { headers: { accept: 'application/json' } });
    if (!response.ok) {
      setStatus($('a-status'), 'The demo stream is not ready yet. Try again in a minute.', true);
      setStatus($('b-status'), 'Waiting for the demo stream.', true);
      return;
    }
    config = await response.json();
  } catch {
    setStatus($('a-status'), 'Could not reach the demo config endpoint.', true);
    return;
  }

  if (!config.p2p) {
    setStatus($('a-status'), 'Peer delivery is disabled for this stream (kill switch).', true);
    setStatus($('b-status'), 'Peer delivery is disabled for this stream.', true);
    setStatus($('global-status'), 'The demo stream is CDN-only right now.', true);
    return;
  }

  const absolute = (path) => new URL(path, 'https://seedess.com').toString();
  const room = `demo-${(crypto.randomUUID?.() ?? Math.random().toString(36).slice(2)).slice(0, 8)}`;
  const options = {
    room,
    stream: config.id,
    signalingUrl: absolute(config.signaling),
    configUrl: absolute(config.config),
    haveWaitMs: 800,
    hedgeDelay: 1500,
  };
  const master = absolute(config.master);

  try {
    const playerA = await createPlayer(videoA, master, options);
    playerA.on('stats', (stats) => renderViewer('a', stats));
    setStatus($('a-status'), 'Fetching from the CDN…');
    videoA.play().catch(() => {});

    seeded = await waitForSegments(playerA, 3, 30000);
    if (!seeded) {
      setStatus($('a-status'), 'Still loading — Viewer B will start on the CDN.', true);
    } else {
      setStatus($('a-status'), 'Seeding the segments it has. Viewer B joins next.');
    }

    if (!bStarted) {
      bStarted = true;
      startViewerB(master, options);
    }
  } catch (error) {
    setStatus($('a-status'), error.message || 'Could not start Viewer A.', true);
    setStatus($('b-status'), 'Viewer A failed to start.', true);
  }
}

async function startViewerB(master, options) {
  try {
    setStatus($('b-status'), 'Starting on the CDN — peer link in the background…');
    const hls = new Hls();
    const playerB = attach(hls, options);
    controllerB = playerB;
    playerB.on('stats', (stats) => renderViewer('b', stats));

    // Start playback immediately, like a normal hls.js player. The mesh joins in
    // the background and takes over segment requests once a peer is available.
    hls.loadSource(master);
    hls.attachMedia(videoB);
    videoB.play().catch(() => {});

    playerB.waitForPeers(15000).then((ok) => {
      if (ok) {
        setStatus($('b-status'), 'Peer link open — peer bytes appear as segments are shared.');
      } else {
        setStatus($('b-status'), 'No peer link — Viewer B is playing from the CDN.', true);
        setStatus($('global-status'), 'No WebRTC peer link in this browser — both viewers are using the CDN.');
      }
    });
  } catch (error) {
    setStatus($('b-status'), error.message || 'Could not start Viewer B.', true);
  }
}

start();
