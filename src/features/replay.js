// Replay engine for WriteProof

import { insertAt, deleteAt, sleep } from '../utils/helpers.js';
import { generateContentHash } from '../core/hashing.js';

const MAX_DELAY_MS = 3000;

export class ReplayEngine {
  constructor(doc, options = {}) {
    this._doc = doc;
    this._speed = options.speed || 1;
    this._onProgress = options.onProgress || null;
    this._onHashCheck = options.onHashCheck || null;
    this._onComplete = options.onComplete || null;
    this._onStateChange = options.onStateChange || null;

    this._index = 0;
    this._content = '';
    this._state = 'stopped'; // stopped | playing | paused
    this._abortController = null;

    // Build checkpoint map for fast lookup
    this._checkpointMap = new Map();
    for (const cp of doc.hashChain) {
      this._checkpointMap.set(cp.keystrokeIndex, cp);
    }

    // Snapshot cache for seeking (every 1000 keystrokes)
    this._snapshots = new Map();
    this._buildSnapshots();
  }

  _buildSnapshots() {
    let content = '';
    const log = this._doc.keystrokeLog;
    this._snapshots.set(0, '');

    for (let i = 0; i < log.length; i++) {
      const event = log[i];
      if (event.type === 'insert' || event.type === 'paste') {
        content = insertAt(content, event.position, event.char);
      } else if (event.type === 'delete') {
        content = deleteAt(content, event.position, event.length);
      }

      if ((i + 1) % 1000 === 0) {
        this._snapshots.set(i + 1, content);
      }
    }
  }

  get state() { return this._state; }
  get index() { return this._index; }
  get total() { return this._doc.keystrokeLog.length; }
  get content() { return this._content; }
  get speed() { return this._speed; }

  setSpeed(speed) {
    this._speed = speed;
  }

  async play() {
    if (this._state === 'playing') return;
    this._state = 'playing';
    this._abortController = new AbortController();
    this._emitStateChange();

    const log = this._doc.keystrokeLog;

    while (this._index < log.length) {
      if (this._abortController.signal.aborted) return;
      if (this._state !== 'playing') return;

      const event = log[this._index];

      // Apply keystroke
      if (event.type === 'insert' || event.type === 'paste') {
        this._content = insertAt(this._content, event.position, event.char);
      } else if (event.type === 'delete') {
        this._content = deleteAt(this._content, event.position, event.length);
      }

      // Verify hash at checkpoints
      const checkpoint = this._checkpointMap.get(this._index);
      if (checkpoint && this._onHashCheck) {
        const computedHash = await generateContentHash(this._content);
        this._onHashCheck({
          index: this._index,
          valid: computedHash === checkpoint.contentHash,
          checkpoint,
        });
      }

      this._index++;

      // Emit progress
      if (this._onProgress) {
        this._onProgress({
          index: this._index,
          total: log.length,
          content: this._content,
          position: event.position + (event.type === 'delete' ? 0 : event.char.length),
          timestamp: event.timestamp,
          event,
        });
      }

      // Delay before next keystroke
      if (this._index < log.length && this._state === 'playing') {
        const nextEvent = log[this._index];
        let delay = (nextEvent.timestamp - event.timestamp) / this._speed;
        delay = Math.min(delay, MAX_DELAY_MS / this._speed);
        delay = Math.max(delay, 0);
        if (delay > 5) {
          await sleep(delay);
        }
      }
    }

    if (this._state === 'playing') {
      this._state = 'stopped';
      this._emitStateChange();
      if (this._onComplete) this._onComplete();
    }
  }

  pause() {
    if (this._state !== 'playing') return;
    this._state = 'paused';
    this._emitStateChange();
  }

  resume() {
    if (this._state !== 'paused') return;
    this.play();
  }

  stop() {
    this._state = 'stopped';
    if (this._abortController) this._abortController.abort();
    this._index = 0;
    this._content = '';
    this._emitStateChange();
  }

  seekTo(index) {
    const wasPaused = this._state === 'paused';
    const wasPlaying = this._state === 'playing';
    if (wasPlaying) this.pause();

    // Find nearest snapshot at or before target
    let snapshotIndex = 0;
    for (const [idx] of this._snapshots) {
      if (idx <= index && idx > snapshotIndex) snapshotIndex = idx;
    }

    this._content = this._snapshots.get(snapshotIndex) || '';
    const log = this._doc.keystrokeLog;

    for (let i = snapshotIndex; i < index && i < log.length; i++) {
      const event = log[i];
      if (event.type === 'insert' || event.type === 'paste') {
        this._content = insertAt(this._content, event.position, event.char);
      } else if (event.type === 'delete') {
        this._content = deleteAt(this._content, event.position, event.length);
      }
    }

    this._index = index;

    if (this._onProgress) {
      const event = index > 0 ? log[index - 1] : null;
      this._onProgress({
        index: this._index,
        total: log.length,
        content: this._content,
        position: event ? event.position : 0,
        timestamp: event ? event.timestamp : 0,
        event,
      });
    }

    if (wasPlaying) this.play();
  }

  _emitStateChange() {
    if (this._onStateChange) this._onStateChange(this._state);
  }
}
