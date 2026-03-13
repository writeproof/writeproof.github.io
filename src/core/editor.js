// Editor orchestration and document lifecycle for WriteProof

import { generateUUID, countWords, formatTime } from '../utils/helpers.js';
import { renderContentWithLinks, extractContentAndLinks } from '../utils/caret.js';
import { KeystrokeRecorder } from './keystroke.js';
import { saveDocument, loadDocument } from './storage.js';
import { buildCheckpoints } from './hashing.js';

export class Editor {
  constructor(textarea, options = {}) {
    this._textarea = textarea;
    this._doc = null;
    this._recorder = null;
    this._autoSaveTimer = null;
    this._sessionTimer = null;
    this._sessionStart = null;
    this._dirty = false;
    this._onUpdate = options.onUpdate || null;
    this._onSaveError = options.onSaveError || null;
    this._autoSaveInterval = options.autoSaveInterval || 5000;
  }

  createDocument(title = 'Untitled Document', seedOptions = null) {
    const now = new Date().toISOString();
    this._doc = {
      id: generateUUID(),
      title,
      createdAt: now,
      lastModified: now,
      content: '',
      links: [],
      keystrokeLog: [],
      chainHash: '',
      seeded: false,
      seedHash: '',
      metadata: {
        totalKeystrokes: 0,
        totalTime: 0,
        wordCount: 0,
        characterCount: 0,
      },
    };

    if (seedOptions && seedOptions.seeded) {
      this._doc.seeded = true;
      this._doc.seedHash = seedOptions.seedHash;
    }

    this._textarea.innerHTML = '';
    this._initRecording();
    this._startAutoSave();
    this._startSessionTimer();
    this._dirty = true;
    this.save();
    this._emitUpdate();
    return this._doc;
  }

  loadDocument(id) {
    const doc = loadDocument(id);
    if (!doc) return null;

    this._doc = doc;
    renderContentWithLinks(this._textarea, doc.content, doc.links || []);
    this._initRecording();
    this._startAutoSave();
    this._startSessionTimer();
    this._emitUpdate();
    return this._doc;
  }

  loadDocumentData(doc) {
    this._doc = doc;
    if (!doc.links) doc.links = [];
    renderContentWithLinks(this._textarea, doc.content, doc.links);
    this._initRecording();
    this._startAutoSave();
    this._startSessionTimer();
    this._emitUpdate();
    return this._doc;
  }

  _initRecording() {
    if (this._recorder) this._recorder.stop();
    this._recorder = new KeystrokeRecorder(this._textarea, this._doc);
    this._recorder.onKeystroke(() => {
      this._dirty = true;
      this._updateMetadata();
      this._emitUpdate();
    });
    this._recorder.start();
  }

  _updateMetadata() {
    if (!this._doc) return;
    this._doc.metadata.totalKeystrokes = this._doc.keystrokeLog.length;
    this._doc.metadata.wordCount = countWords(this._doc.content);
    this._doc.metadata.characterCount = this._doc.content.length;
  }

  _startAutoSave() {
    this._stopAutoSave();
    this._autoSaveTimer = setInterval(() => {
      if (this._dirty) this.save();
    }, this._autoSaveInterval);
  }

  _stopAutoSave() {
    if (this._autoSaveTimer) {
      clearInterval(this._autoSaveTimer);
      this._autoSaveTimer = null;
    }
  }

  _startSessionTimer() {
    this._sessionStart = Date.now();
    this._stopSessionTimer();
    this._sessionTimer = setInterval(() => {
      if (this._doc) {
        this._doc.metadata.totalTime += 1000;
        this._emitUpdate();
      }
    }, 1000);
  }

  _stopSessionTimer() {
    if (this._sessionTimer) {
      clearInterval(this._sessionTimer);
      this._sessionTimer = null;
    }
  }

  async save() {
    if (!this._doc) return false;
    // Wait for all pending hash computations so chainHash is consistent.
    // Loop because new events can arrive while we await, extending the queue.
    if (this._recorder) {
      let ready = this._recorder.hashReady;
      await ready;
      let attempts = 0;
      while (this._recorder.hashReady !== ready && attempts++ < 20) {
        ready = this._recorder.hashReady;
        await ready;
      }
    }
    this._doc.lastModified = new Date().toISOString();
    // Extract current links from the editor DOM
    const { links } = extractContentAndLinks(this._textarea);
    this._doc.links = links;
    this._updateMetadata();
    // Build verification checkpoints if log has grown past existing ones
    this._maybeUpdateCheckpoints();
    const ok = saveDocument(this._doc);
    if (ok) {
      this._dirty = false;
    } else if (this._onSaveError) {
      this._onSaveError('Storage full. Export your document to avoid data loss.');
    }
    this._emitUpdate();
    return ok;
  }

  setTitle(title) {
    if (!this._doc) return;
    this._doc.title = title;
    this._dirty = true;
  }

  editLink(linkEl, newUrl) {
    if (!linkEl || linkEl.tagName !== 'A') return;
    linkEl.href = newUrl;
    this._dirty = true;
  }

  removeLink(linkEl) {
    if (!linkEl || linkEl.tagName !== 'A') return;
    const parent = linkEl.parentNode;
    const text = document.createTextNode(linkEl.textContent);
    parent.replaceChild(text, linkEl);
    this._dirty = true;
  }

  _emitUpdate() {
    if (this._onUpdate) this._onUpdate(this.getState());
  }

  getState() {
    if (!this._doc) return null;
    return {
      id: this._doc.id,
      title: this._doc.title,
      wordCount: this._doc.metadata.wordCount,
      characterCount: this._doc.metadata.characterCount,
      keystrokeCount: this._doc.keystrokeLog.length,
      chainHash: this._doc.chainHash,
      totalTime: this._doc.metadata.totalTime,
      formattedTime: formatTime(this._doc.metadata.totalTime),
      lastModified: this._doc.lastModified,
      isDirty: this._dirty,
    };
  }

  _maybeUpdateCheckpoints() {
    if (!this._doc) return;
    const log = this._doc.keystrokeLog;
    const existing = this._doc.checkpoints || [];
    const lastCpIndex = existing.length > 0 ? existing[existing.length - 1].index : 0;
    // Only rebuild if we've accumulated 1000+ new events past the last checkpoint
    if (log.length - lastCpIndex >= 1000) {
      buildCheckpoints(this._doc).catch(() => {});
    }
  }

  getDocument() {
    return this._doc;
  }

  destroy() {
    if (this._dirty) this.save();
    if (this._recorder) this._recorder.stop();
    this._stopAutoSave();
    this._stopSessionTimer();
  }
}
