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

  async _handleInput(e) {
    if (!this._recording) return;

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
      // Paste operation
      const pastedText = newValue.slice(selStart, selStart + (newValue.length - prevValue.length + selectedLen));

      // If there was a selection, record the deletion first
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
      // Deletion
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
      // Insertion (typing or Enter)
      const insertedChar = e.inputType === 'insertText' ? (e.data || '') : '\n';

      // If there was a selection, record deletion first
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
      // Autocorrect / spell-check replacements
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
      // Fallback: diff-based detection
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

    // Update doc content
    this._doc.content = newValue;

    // Add content hash to each event and push to log
    try {
      for (const evt of events) {
        evt.contentHash = await generateContentHash(newValue);
        this._doc.keystrokeLog.push(evt);

        // Hash checkpoint every N keystrokes
        if (this._doc.keystrokeLog.length % CHECKPOINT_INTERVAL === 0) {
          await createHashCheckpoint(this._doc);
        }
      }
    } catch (err) {
      // If hashing fails, still record the events without hashes
      for (const evt of events) {
        if (!evt.contentHash) evt.contentHash = '';
        if (!this._doc.keystrokeLog.includes(evt)) {
          this._doc.keystrokeLog.push(evt);
        }
      }
      console.warn('[WriteProof] Hashing error:', err.message);
    }

    // Update prev state
    this._prevValue = newValue;
    const updatedOffsets = getSelectionOffsets(this._textarea);
    this._prevSelStart = updatedOffsets.start;
    this._prevSelEnd = updatedOffsets.end;

    if (this._onKeystroke && events.length > 0) {
      this._onKeystroke(events);
    }
  }

  resetSessionStart() {
    this._sessionStart = performance.now();
  }

  get sessionElapsed() {
    return performance.now() - this._sessionStart;
  }
}
