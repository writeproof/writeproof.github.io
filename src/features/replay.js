// Replay engine for WriteProof

import { insertAt, deleteAt, sleep } from '../utils/helpers.js';

const MAX_DELAY_MS = 3000;

export class ReplayEngine {
  constructor(doc, options = {}) {
    this._doc = doc;
    this._speed = options.speed || 1;
    this._onProgress = options.onProgress || null;
    this._onComplete = options.onComplete || null;
    this._onStateChange = options.onStateChange || null;

    this._index = 0;
    this._content = '';
    this._state = 'stopped'; // stopped | playing | paused
    this._abortController = null;

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
      if (event.y === 'i' || event.y === 'p') {
        content = insertAt(content, event.p, event.c);
      } else if (event.y === 'd') {
        content = deleteAt(content, event.p, event.c.length);
      }
      // 'm' events don't affect content

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

      // Apply keystroke (skip move events for content)
      if (event.y === 'i' || event.y === 'p') {
        this._content = insertAt(this._content, event.p, event.c);
      } else if (event.y === 'd') {
        this._content = deleteAt(this._content, event.p, event.c.length);
      }

      this._index++;

      // Emit progress
      if (this._onProgress) {
        this._onProgress({
          index: this._index,
          total: log.length,
          content: this._content,
          position: event.y === 'd' ? event.p : event.p + (event.c ? event.c.length : 0),
          timestamp: event.t,
          event,
        });
      }

      // Delay before next keystroke
      if (this._index < log.length && this._state === 'playing') {
        const nextEvent = log[this._index];
        let delay = (nextEvent.t - event.t) / this._speed;
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
      if (event.y === 'i' || event.y === 'p') {
        this._content = insertAt(this._content, event.p, event.c);
      } else if (event.y === 'd') {
        this._content = deleteAt(this._content, event.p, event.c.length);
      }
    }

    this._index = index;

    if (this._onProgress) {
      const event = index > 0 ? log[index - 1] : null;
      this._onProgress({
        index: this._index,
        total: log.length,
        content: this._content,
        position: event ? event.p : 0,
        timestamp: event ? event.t : 0,
        event,
      });
    }

    if (wasPlaying) this.play();
  }

  _emitStateChange() {
    if (this._onStateChange) this._onStateChange(this._state);
  }
}
