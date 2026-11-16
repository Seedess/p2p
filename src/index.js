/**
 * @seedess/p2p — the universal entry point.
 *
 * Two ways to use it:
 *
 *   import { attach } from '@seedess/p2p/hls';   // one adapter, smallest bundle
 *   import { auto } from '@seedess/p2p';         // detect players at runtime
 *
 * `auto()` is deliberately thin: it patches the seams a player exposes and
 * delegates to the matching adapter. It never claims to support a player whose
 * network stack cannot be intercepted (native HLS, VHS).
 */

export { auto } from './auto.js';
export { attach, createPlayer } from './hls.js';
export { SegmentMesh, Signaling, sha256Hex, DEFAULT_ICE } from './core.js';
