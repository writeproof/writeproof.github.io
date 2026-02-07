// Keystroke capture and recording for WriteProof

import { generateContentHash, createHashCheckpoint, CHECKPOINT_INTERVAL } from './hashing.js';
import { getTextContent, getSelectionOffsets } from '../utils/caret.js';

export class KeystrokeRecorder {
  constructor(textarea, doc) {
    this._textarea = textarea;
    this._doc = doc;
    this._sessionStart = performance.now();
    this._prevValue = getTextContent(textarea);
    this._prevSelStart = getSelectionOffsets(textarea).start;
    this._recording = false;
    this._onKeystroke = null;
    this._isPaste = false;
    this._hashQueue = Promise.resolve();

    this._handleInput = this._handleInput.bind(this);
    this._handleBeforeInput = this._handleBeforeInput.bind(this);
    this._handleSelect = this._handleSelect.bind(this);
    this._handlePaste = this._handlePaste.bind(this);
  }

  start() {
    this._recording = true;
    this._prevValue = getTextContent(this._textarea);
    this._prevSelStart = getSelectionOffsets(this._textarea).start;
    this._textarea.addEventListener('beforeinput', this._handleBeforeInput);
    this._textarea.addEventListener('input', this._handleInput);
    this._textarea.addEventListener('select', this._handleSelect);
    this._textarea.addEventListener('click', this._handleSelect);
    this._textarea.addEventListener('keyup', this._handleSelect);
    this._textarea.addEventListener('paste', this._handlePaste);
  }

  stop() {
    this._recording = false;
    this._textarea.removeEventListener('beforeinput', this._handleBeforeInput);
    this._textarea.removeEventListener('input', this._handleInput);
    this._textarea.removeEventListener('select', this._handleSelect);
    this._textarea.removeEventListener('click', this._handleSelect);
    this._textarea.removeEventListener('keyup', this._handleSelect);
    this._textarea.removeEventListener('paste', this._handlePaste);
  }

  onKeystroke(callback) {
    this._onKeystroke = callback;
  }

  _handleSelect() {
    const offsets = getSelectionOffsets(this._textarea);
    this._prevSelStart = offsets.start;
  }

  _handlePaste(e) {
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    this._isPaste = true;
    document.execCommand('insertText', false, text);
  }

  _handleBeforeInput(e) {
    // Capture state before the input event changes the element
    this._prevValue = getTextContent(this._textarea);
    const offsets = getSelectionOffsets(this._textarea);
    this._prevSelStart = offsets.start;
    this._prevSelEnd = offsets.end;
  }

  _handleInput(e) {
    if (!this._recording) return;

    // --- All synchronous: capture state and build events ---

    const now = performance.now();
    const timestamp = now - this._sessionStart;
    const newValue = getTextContent(this._textarea);
    const prevValue = this._prevValue;
    const selStart = this._prevSelStart;
    const selEnd = this._prevSelEnd ?? selStart;
    const selectedLen = selEnd - selStart;
    const isPaste = e.inputType === 'insertFromPaste' || this._isPaste;
    this._isPaste = false;

    let events = [];

    if (isPaste) {
      const pastedText = newValue.slice(selStart, selStart + (newValue.length - prevValue.length + selectedLen));

      if (selectedLen > 0) {
        events.push({
          timestamp,
          type: 'delete',
          position: selStart,
          char: prevValue.slice(selStart, selEnd),
          length: selectedLen,
        });
      }

      events.push({
        timestamp,
        type: 'paste',
        position: selStart,
        char: pastedText,
        length: pastedText.length,
      });
    } else if (e.inputType === 'deleteContentBackward' || e.inputType === 'deleteContentForward' ||
               e.inputType === 'deleteByCut' || e.inputType === 'deleteWordBackward' ||
               e.inputType === 'deleteWordForward' || e.inputType === 'deleteSoftLineBackward') {
      const deletedLen = prevValue.length - newValue.length;
      const deletePos = e.inputType.includes('Forward') ? selStart : selStart - deletedLen + selectedLen;
      const actualPos = Math.max(0, selectedLen > 0 ? selStart : deletePos);
      const deletedChars = prevValue.slice(actualPos, actualPos + deletedLen + selectedLen);

      events.push({
        timestamp,
        type: 'delete',
        position: actualPos,
        char: deletedChars,
        length: deletedChars.length,
      });
    } else if (e.inputType === 'insertText' || e.inputType === 'insertLineBreak' ||
               e.inputType === 'insertParagraph') {
      const insertedChar = e.inputType === 'insertText' ? (e.data || '') : '\n';

      if (selectedLen > 0) {
        events.push({
          timestamp,
          type: 'delete',
          position: selStart,
          char: prevValue.slice(selStart, selEnd),
          length: selectedLen,
        });
      }

      events.push({
        timestamp,
        type: 'insert',
        position: selStart,
        char: insertedChar,
        length: insertedChar.length,
      });
    } else if (e.inputType === 'insertReplacementText') {
      if (selectedLen > 0) {
        events.push({
          timestamp,
          type: 'delete',
          position: selStart,
          char: prevValue.slice(selStart, selEnd),
          length: selectedLen,
        });
      }
      const currentOffsets = getSelectionOffsets(this._textarea);
      const inserted = newValue.slice(selStart, currentOffsets.start);
      if (inserted) {
        events.push({
          timestamp,
          type: 'insert',
          position: selStart,
          char: inserted,
          length: inserted.length,
        });
      }
    } else {
      const lenDiff = newValue.length - prevValue.length;
      if (lenDiff > 0) {
        const inserted = newValue.slice(selStart, selStart + lenDiff + selectedLen);
        if (selectedLen > 0) {
          events.push({
            timestamp,
            type: 'delete',
            position: selStart,
            char: prevValue.slice(selStart, selEnd),
            length: selectedLen,
          });
        }
        events.push({
          timestamp,
          type: 'insert',
          position: selStart,
          char: inserted,
          length: inserted.length,
        });
      } else if (lenDiff < 0) {
        const currentOffsets = getSelectionOffsets(this._textarea);
        const deletePos = selectedLen > 0 ? selStart : currentOffsets.start;
        events.push({
          timestamp,
          type: 'delete',
          position: deletePos,
          char: prevValue.slice(deletePos, deletePos + Math.abs(lenDiff) + selectedLen),
          length: Math.abs(lenDiff) + selectedLen,
        });
      }
    }

    // --- Synchronous updates ---

    this._doc.content = newValue;
    this._prevValue = newValue;
    const updatedOffsets = getSelectionOffsets(this._textarea);
    this._prevSelStart = updatedOffsets.start;
    this._prevSelEnd = updatedOffsets.end;

    if (events.length === 0) return;

    // Push events to log synchronously so keystroke count is always current
    const eventIndices = [];
    for (const evt of events) {
      this._doc.keystrokeLog.push(evt);
      eventIndices.push(this._doc.keystrokeLog.length - 1);
    }

    // Notify UI immediately
    if (this._onKeystroke) {
      this._onKeystroke(events);
    }

    // --- Queue async hashing (serialized) ---

    const contentForHash = newValue;
    this._hashQueue = this._hashQueue.then(async () => {
      try {
        for (let i = 0; i < events.length; i++) {
          events[i].contentHash = await generateContentHash(contentForHash);

          // Create checkpoint if this event's position in the log is a multiple of CHECKPOINT_INTERVAL
          if ((eventIndices[i] + 1) % CHECKPOINT_INTERVAL === 0) {
            await createHashCheckpoint(this._doc, contentForHash, eventIndices[i]);
          }
        }
      } catch (err) {
        for (const evt of events) {
          if (!evt.contentHash) evt.contentHash = '';
        }
        console.warn('[WriteProof] Hashing error:', err.message);
      }
    });
  }

  resetSessionStart() {
    this._sessionStart = performance.now();
  }

  get sessionElapsed() {
    return performance.now() - this._sessionStart;
  }
}
