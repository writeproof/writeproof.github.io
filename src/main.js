// Entry point for WriteProof editor (index.html)

import { Editor } from './core/editor.js';
import { listDocuments, deleteDocument, loadDocument } from './core/storage.js';
import { exportToJSON, importFromJSON } from './features/export.js';
import { calculateAuthenticityScore } from './features/analytics.js';
import { showNotification, showModal } from './ui/components.js';
import { renderDocumentList, renderScoreDisplay } from './ui/views.js';
import { formatNumber, formatTime, countWords } from './utils/helpers.js';
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

// Link UI elements
const linkPopup = document.getElementById('link-popup');
const linkPopupOpen = document.getElementById('link-popup-open');
const linkPopupEdit = document.getElementById('link-popup-edit');
const linkPopupRemove = document.getElementById('link-popup-remove');
const linkDialogBackdrop = document.getElementById('link-dialog-backdrop');
const linkDialogTitle = document.getElementById('link-dialog-title');
const linkTextGroup = document.getElementById('link-text-group');
const linkTextInput = document.getElementById('link-text-input');
const linkUrlInput = document.getElementById('link-url-input');
const linkDialogSave = document.getElementById('link-dialog-save');
const linkDialogCancel = document.getElementById('link-dialog-cancel');
const linkDialogClose = document.getElementById('link-dialog-close');

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
});

// --- Placeholder handling ---
function updatePlaceholder() {
  const text = getTextContent(textarea);
  textarea.classList.toggle('is-empty', text.length === 0);
}

textarea.addEventListener('input', updatePlaceholder);
textarea.addEventListener('focus', updatePlaceholder);
textarea.addEventListener('blur', updatePlaceholder);

// --- Enter key override: insert <br> instead of <div> ---
textarea.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertLineBreak');
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
document.getElementById('btn-export').addEventListener('click', () => {
  const doc = editor.getDocument();
  if (!doc) {
    showNotification('No document to export. Start writing first.', 'warning');
    return;
  }
  editor.save();
  exportToJSON(doc);
  showNotification('Document exported', 'success');
});

// Import
document.getElementById('btn-import').addEventListener('click', () => {
  fileInput.click();
});

fileInput.addEventListener('change', async (e) => {
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
});

// Replay
document.getElementById('btn-replay').addEventListener('click', () => {
  const doc = editor.getDocument();
  if (!doc) {
    showNotification('No document to replay. Start writing first.', 'warning');
    return;
  }
  editor.save();
  window.location.href = `verify.html?doc=${doc.id}`;
});

// Score
document.getElementById('btn-score').addEventListener('click', async () => {
  const doc = editor.getDocument();
  if (!doc || doc.keystrokeLog.length < 10) {
    showNotification('Write at least a few sentences to see your score.', 'warning');
    return;
  }

  editor.save();
  const score = calculateAuthenticityScore(doc);

  const insertions = doc.keystrokeLog.filter((k) => k.type === 'insert').length;
  const deletions = doc.keystrokeLog.filter((k) => k.type === 'delete').length;
  const pastes = doc.keystrokeLog.filter((k) => k.type === 'paste').length;
  const totalTime = doc.metadata.totalTime;
  const wpm = totalTime > 0
    ? Math.round(countWords(doc.content) / (totalTime / 60000))
    : 0;

  const stats = {
    totalKeystrokes: doc.keystrokeLog.length,
    insertions,
    deletions,
    pastes,
    wpm,
    duration: formatTime(totalTime),
    checkpoints: doc.hashChain.length,
    checkpointsValid: true,
  };

  const content = renderScoreDisplay(score, stats);
  showModal('Writing Authenticity Analysis', content);
});

// Save on Ctrl+S
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    editor.save();
    showNotification('Saved', 'success', 1500);
  }
});

// Save before unload
window.addEventListener('beforeunload', () => {
  editor.destroy();
});

// Save on visibility change
document.addEventListener('visibilitychange', () => {
  if (document.hidden) editor.save();
});

// Welcome panel
const welcomeBackdrop = document.getElementById('welcome-backdrop');

function openWelcome() {
  welcomeBackdrop.style.display = 'flex';
}

function closeWelcome() {
  welcomeBackdrop.style.display = 'none';
  localStorage.setItem('writeproof_welcomed', '1');
}

document.getElementById('btn-info').addEventListener('click', openWelcome);
document.getElementById('btn-start-writing').addEventListener('click', closeWelcome);

welcomeBackdrop.addEventListener('click', (e) => {
  if (e.target === welcomeBackdrop) closeWelcome();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && welcomeBackdrop.style.display !== 'none') {
    closeWelcome();
  }
});

// === Link Feature ===

let activeLinkEl = null; // The <a> element currently being edited/popped
let linkDialogMode = null; // 'insert-text', 'insert-selection', 'edit'
let savedSelection = null; // Saved selection range for restoring after dialog

function normalizeUrl(url) {
  url = url.trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

function saveSelection() {
  const sel = window.getSelection();
  if (sel.rangeCount > 0) {
    savedSelection = sel.getRangeAt(0).cloneRange();
  }
}

function restoreSelection() {
  if (!savedSelection) return;
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(savedSelection);
  savedSelection = null;
}

function openLinkDialog(mode, existingUrl) {
  linkDialogMode = mode;
  linkTextInput.value = '';
  linkUrlInput.value = existingUrl || '';

  if (mode === 'insert-text') {
    // No selection: show text + URL fields
    linkTextGroup.style.display = '';
    linkDialogTitle.textContent = 'Insert Link';
    linkDialogSave.textContent = 'Insert';
  } else if (mode === 'insert-selection') {
    // Has selection: URL only
    linkTextGroup.style.display = 'none';
    linkDialogTitle.textContent = 'Insert Link';
    linkDialogSave.textContent = 'Insert';
  } else if (mode === 'edit') {
    // Editing existing link: URL only
    linkTextGroup.style.display = 'none';
    linkDialogTitle.textContent = 'Edit Link';
    linkDialogSave.textContent = 'Save';
  }

  linkDialogBackdrop.style.display = 'flex';
  linkUrlInput.focus();
}

function closeLinkDialog() {
  linkDialogBackdrop.style.display = 'none';
  linkTextInput.value = '';
  linkUrlInput.value = '';
  linkDialogMode = null;
  activeLinkEl = null;
}

function handleLinkDialogSubmit() {
  const url = normalizeUrl(linkUrlInput.value);
  if (!url) {
    linkUrlInput.focus();
    return;
  }

  if (linkDialogMode === 'edit' && activeLinkEl) {
    editor.editLink(activeLinkEl, url);
    closeLinkDialog();
    return;
  }

  if (linkDialogMode === 'insert-selection') {
    restoreSelection();
    // Wrap the current selection in a link
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && !sel.isCollapsed) {
      const range = sel.getRangeAt(0);
      const a = document.createElement('a');
      a.href = url;
      a.className = 'editor-link';
      a.contentEditable = 'false';
      a.target = '_blank';
      a.rel = 'noopener';
      try {
        range.surroundContents(a);
      } catch (_) {
        // If surroundContents fails (partial selection across nodes), fallback
        a.textContent = sel.toString();
        range.deleteContents();
        range.insertNode(a);
      }
      sel.removeAllRanges();
      // Place caret after the link
      const afterRange = document.createRange();
      afterRange.setStartAfter(a);
      afterRange.collapse(true);
      sel.addRange(afterRange);
    }
    closeLinkDialog();
    return;
  }

  if (linkDialogMode === 'insert-text') {
    const text = linkTextInput.value.trim() || url;
    restoreSelection();
    // Insert the link at current caret position
    const a = document.createElement('a');
    a.href = url;
    a.className = 'editor-link';
    a.contentEditable = 'false';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text;

    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(a);
      // Place caret after the link
      const afterRange = document.createRange();
      afterRange.setStartAfter(a);
      afterRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(afterRange);
    } else {
      textarea.appendChild(a);
    }
    closeLinkDialog();
    return;
  }

  closeLinkDialog();
}

// Link button
document.getElementById('btn-link').addEventListener('click', () => {
  textarea.focus();
  saveSelection();
  const offsets = getSelectionOffsets(textarea);
  if (offsets.start !== offsets.end) {
    openLinkDialog('insert-selection');
  } else {
    openLinkDialog('insert-text');
  }
});

// Ctrl+K shortcut
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    document.getElementById('btn-link').click();
  }
});

// Link dialog events
linkDialogSave.addEventListener('click', handleLinkDialogSubmit);
linkDialogCancel.addEventListener('click', closeLinkDialog);
linkDialogClose.addEventListener('click', closeLinkDialog);

linkDialogBackdrop.addEventListener('click', (e) => {
  if (e.target === linkDialogBackdrop) closeLinkDialog();
});

linkUrlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleLinkDialogSubmit();
  }
});

linkTextInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    linkUrlInput.focus();
  }
});

// --- Link popup (click on link) ---

function showLinkPopup(linkEl) {
  activeLinkEl = linkEl;
  const rect = linkEl.getBoundingClientRect();
  linkPopup.style.display = 'flex';
  linkPopup.style.left = `${rect.left + rect.width / 2}px`;
  linkPopup.style.top = `${rect.top - 8}px`;
}

function hideLinkPopup() {
  linkPopup.style.display = 'none';
  activeLinkEl = null;
}

textarea.addEventListener('click', (e) => {
  const linkEl = e.target.closest('a.editor-link');
  if (linkEl) {
    e.preventDefault();
    showLinkPopup(linkEl);
  } else {
    hideLinkPopup();
  }
});

// Dismiss popup on scroll or click outside
document.addEventListener('click', (e) => {
  if (linkPopup.style.display === 'none') return;
  if (linkPopup.contains(e.target)) return;
  if (e.target.closest && e.target.closest('a.editor-link')) return;
  hideLinkPopup();
});

document.addEventListener('scroll', hideLinkPopup, true);

// Popup actions
linkPopupOpen.addEventListener('click', () => {
  if (activeLinkEl) {
    window.open(activeLinkEl.href, '_blank', 'noopener');
  }
  hideLinkPopup();
});

linkPopupEdit.addEventListener('click', () => {
  if (activeLinkEl) {
    const url = activeLinkEl.getAttribute('href') || '';
    openLinkDialog('edit', url);
  }
  hideLinkPopup();
});

linkPopupRemove.addEventListener('click', () => {
  if (activeLinkEl) {
    editor.removeLink(activeLinkEl);
  }
  hideLinkPopup();
});

// --- Init ---

try {
  init();
  if (!localStorage.getItem('writeproof_welcomed')) {
    openWelcome();
  }
  console.log('[WriteProof] Editor initialized');
} catch (err) {
  console.error('[WriteProof] Failed to initialize:', err);
  showNotification('Failed to initialize editor. Check browser console.', 'error', 10000);
}
