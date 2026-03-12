// Entry point for WriteProof editor (index.html)

import { Editor } from './core/editor.js';
import { listDocuments, deleteDocument, loadDocument } from './core/storage.js';
import { exportToJSON, importFromJSON } from './features/export.js';
import { analyzeWritingProfile } from './features/analytics.js';
import { showNotification, showModal } from './ui/components.js';
import { renderDocumentList, renderWritingProfile } from './ui/views.js';
import { initLinkFeature } from './ui/link-dialog.js';
import { initWelcome } from './ui/welcome.js';
import { formatNumber, formatTime, countWords, safe } from './utils/helpers.js';
import { getSelectionOffsets, setCaretOffset, getTextContent } from './utils/caret.js';

// Check crypto availability
if (!crypto.subtle) {
  console.warn('[WriteProof] Web Crypto API not available (non-secure context). Using fallback hashing. For full SHA-256, serve over HTTPS or localhost.');
}

// DOM elements
const textarea = document.getElementById('editor');
const titleInput = document.getElementById('doc-title');
const wordCountEl = document.getElementById('word-count');
const charCountEl = document.getElementById('char-count');
const sessionTimeEl = document.getElementById('session-time');
const saveStatusEl = document.getElementById('save-status');
const fileInput = document.getElementById('file-input');

// Initialize editor
const editor = new Editor(textarea, {
  onUpdate: (state) => {
    if (!state) return;
    wordCountEl.textContent = formatNumber(state.wordCount);
    charCountEl.textContent = formatNumber(state.characterCount);
    sessionTimeEl.textContent = state.formattedTime;
    saveStatusEl.textContent = state.isDirty ? 'Unsaved changes' : 'Saved';
    saveStatusEl.style.color = state.isDirty ? 'var(--color-warning)' : 'var(--color-gray-400)';
  },
  onSaveError: (msg) => {
    showNotification(msg, 'error', 8000);
  },
});

// --- Placeholder handling ---
function updatePlaceholder() {
  const text = getTextContent(textarea);
  textarea.classList.toggle('is-empty', text.length === 0);
}

textarea.addEventListener('input', safe(updatePlaceholder));
textarea.addEventListener('focus', safe(updatePlaceholder));
textarea.addEventListener('blur', safe(updatePlaceholder));

// --- Enter key override: insert <br> instead of <div> ---
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    // Try execCommand first; fall back to manual BR insertion
    if (!document.execCommand('insertLineBreak')) {
      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const br = document.createElement('br');
        range.insertNode(br);
        range.setStartAfter(br);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        textarea.dispatchEvent(new InputEvent('input', {
          inputType: 'insertLineBreak',
          bubbles: true,
          cancelable: false,
        }));
      }
    }
  }
});

// Load document from URL param or create new
function init() {
  const params = new URLSearchParams(window.location.search);
  const docId = params.get('doc');

  if (docId) {
    const doc = editor.loadDocument(docId);
    if (doc) {
      titleInput.value = doc.title;
    } else {
      showNotification('Document not found. Creating new document.', 'warning');
      editor.createDocument();
    }
  } else {
    // Load most recent document or create new
    const docs = listDocuments();
    if (docs.length > 0) {
      const doc = editor.loadDocument(docs[0].id);
      if (doc) titleInput.value = doc.title;
    } else {
      editor.createDocument();
    }
  }
  updatePlaceholder();
}

// Title change
titleInput.addEventListener('input', () => {
  editor.setTitle(titleInput.value);
});

// Enter on title → return focus to editor at previous caret position
let lastEditorOffset = 0;
textarea.addEventListener('blur', () => {
  lastEditorOffset = getSelectionOffsets(textarea).start;
});
titleInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    textarea.focus();
    setCaretOffset(textarea, lastEditorOffset);
  }
});

// New document
document.getElementById('btn-new').addEventListener('click', () => {
  editor.destroy();
  editor.createDocument();
  titleInput.value = 'Untitled Document';
  textarea.focus();
  updatePlaceholder();
  showNotification('New document created', 'success');
});

// My Documents
document.getElementById('btn-docs').addEventListener('click', () => {
  const docs = listDocuments();
  const content = renderDocumentList(docs, {
    onOpen: (id) => {
      modal.close();
      editor.destroy();
      const doc = editor.loadDocument(id);
      if (doc) {
        titleInput.value = doc.title;
        updatePlaceholder();
        showNotification('Document loaded', 'success');
      }
    },
    onDelete: (id) => {
      deleteDocument(id);
      // If we deleted the current document, create a new one
      const state = editor.getState();
      if (state && state.id === id) {
        editor.destroy();
        editor.createDocument();
        titleInput.value = 'Untitled Document';
        updatePlaceholder();
      }
      // Refresh the modal
      modal.close();
      document.getElementById('btn-docs').click();
    },
    onReplay: (id) => {
      modal.close();
      window.open(`verify.html?doc=${id}`, '_blank');
    },
  });

  const modal = showModal('My Documents', content);
});

// Export
document.getElementById('btn-export').addEventListener('click', async () => {
  const doc = editor.getDocument();
  if (!doc) {
    showNotification('No document to export. Start writing first.', 'warning');
    return;
  }
  await editor.save();
  exportToJSON(doc);
  showNotification('Document exported', 'success');
});

// Import
document.getElementById('btn-import').addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', safe(async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const doc = await importFromJSON(file);
    editor.destroy();
    editor.loadDocumentData(doc);
    titleInput.value = doc.title;
    updatePlaceholder();
    showNotification('Document imported', 'success');
  } catch (err) {
    showNotification(err.message, 'error');
  }
  fileInput.value = '';
}));

// Replay
document.getElementById('btn-replay').addEventListener('click', async () => {
  const doc = editor.getDocument();
  if (!doc) {
    showNotification('No document to replay. Start writing first.', 'warning');
    return;
  }
  await editor.save();
  window.location.href = `verify.html?doc=${doc.id}`;
});

// Writing Profile
document.getElementById('btn-score').addEventListener('click', async () => {
  const doc = editor.getDocument();
  if (!doc || doc.keystrokeLog.length < 10) {
    showNotification('Write at least a few sentences to see your writing profile.', 'warning');
    return;
  }

  await editor.save();
  const profile = analyzeWritingProfile(doc);
  const content = renderWritingProfile(profile);
  showModal('Writing Profile', content);
});

// Save on Ctrl+S
document.addEventListener('keydown', async (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    await editor.save();
    showNotification('Saved', 'success', 1500);
  }
});

// Save before unload
window.addEventListener('beforeunload', () => {
  editor.destroy();
});

// Save on visibility change
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) await editor.save();
});

// Multi-tab conflict detection
window.addEventListener('storage', (e) => {
  if (e.key === 'writeproof_docs') {
    showNotification('Document modified in another tab. Reload to see changes.', 'warning', 6000);
  }
});

// --- Init ---

try {
  init();
  initLinkFeature(textarea, editor);
  initWelcome();
  console.log('[WriteProof] Editor initialized');
} catch (err) {
  console.error('[WriteProof] Failed to initialize:', err);
  showNotification('Failed to initialize editor. Check browser console.', 'error', 10000);
}
