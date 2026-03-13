// Entry point for WriteProof editor (index.html)

import { Editor } from './core/editor.js';
import { listDocuments, deleteDocument, loadDocument } from './core/storage.js';
import { exportToJSON, importFromJSON } from './features/export.js';
import { analyzeWritingProfile } from './features/analytics.js';
import { generateContentHash } from './core/hashing.js';
import { generatePasscode, saveKey, listKeys, exportAllKeys, exportSingleKey, importKeysFromJSON, hasAnyKeys } from './core/keys.js';
import { showNotification, showModal, createElement } from './ui/components.js';
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
const keyFileInput = document.getElementById('key-file-input');
const instructorBanner = document.getElementById('instructor-banner');
const btnKeys = document.getElementById('btn-keys');

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

// Enter on title -> return focus to editor at previous caret position
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

// === Instructor Features ===

function showInstructorUI() {
  btnKeys.style.display = '';
  if (!sessionStorage.getItem('writeproof_banner_dismissed')) {
    instructorBanner.style.display = 'flex';
  }
}

document.getElementById('instructor-banner-close').addEventListener('click', () => {
  instructorBanner.style.display = 'none';
  sessionStorage.setItem('writeproof_banner_dismissed', '1');
});

// --- Create Assignment ---

document.getElementById('btn-assignment').addEventListener('click', () => {
  let keyExported = false;
  let createdSeedHash = null;

  // Step 1: Name input
  const body = createElement('div', {}, []);

  const warning = createElement('p', {
    className: 'text-sm',
    style: 'background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; line-height: 1.5;',
  }, [
    'Your assignment key will be stored in this browser only. You ',
    createElement('strong', {}, ['must']),
    ' export the key backup before closing this dialog.',
  ]);
  body.appendChild(warning);

  const nameLabel = createElement('label', {
    style: 'display:block; font-size: 0.875rem; font-weight: 500; margin-bottom: 0.375rem;',
  }, ['Assignment Name']);
  body.appendChild(nameLabel);

  const nameInput = createElement('input', {
    className: 'link-dialog-input',
    type: 'text',
    placeholder: 'e.g. ECO2013 Week 4 Essay',
    style: 'margin-bottom: 1rem;',
  });
  body.appendChild(nameInput);

  const createBtn = createElement('button', {
    className: 'btn btn-accent btn-sm',
    textContent: 'Create Assignment',
  });
  body.appendChild(createBtn);

  const modal = showModal('Create Assignment', body, {
    beforeClose: () => {
      if (createdSeedHash && !keyExported) {
        showNotification('You must export the key backup before closing.', 'warning');
        return false;
      }
      return true;
    },
  });

  createBtn.addEventListener('click', async () => {
    const assignmentName = nameInput.value.trim();
    if (!assignmentName) {
      showNotification('Please enter an assignment name.', 'warning');
      nameInput.focus();
      return;
    }

    const passcode = generatePasscode();
    const seedHash = await generateContentHash(passcode);
    createdSeedHash = seedHash;

    saveKey(seedHash, {
      assignmentName,
      passcode,
      createdAt: new Date().toISOString(),
    });

    showInstructorUI();

    // Step 2: Show success with mandatory key export
    body.innerHTML = '';

    const successMsg = createElement('p', {
      style: 'margin-bottom: 0.5rem;',
    }, [
      'Assignment "',
      createElement('strong', {}, [assignmentName]),
      '" created.',
    ]);
    body.appendChild(successMsg);

    const hashMsg = createElement('p', {
      className: 'text-sm text-muted',
      style: 'margin-bottom: 1.5rem; font-family: var(--font-mono, monospace); word-break: break-all;',
      textContent: `Seed: ${seedHash.slice(0, 16)}...`,
    });
    body.appendChild(hashMsg);

    const exportKeyBtn = createElement('button', {
      className: 'btn btn-accent btn-sm btn-pulse',
      textContent: 'Download Key Backup',
      style: 'margin-bottom: 0.75rem; display: block; width: 100%;',
    });
    body.appendChild(exportKeyBtn);

    const exportDocBtn = createElement('button', {
      className: 'btn btn-primary btn-sm',
      textContent: 'Download Starter Document',
      style: 'display: block; width: 100%; opacity: 0.5; pointer-events: none;',
    });
    body.appendChild(exportDocBtn);

    const hint = createElement('p', {
      className: 'text-xs text-muted',
      style: 'margin-top: 0.75rem;',
      textContent: 'Download the key backup first, then the starter document to distribute to students.',
    });
    body.appendChild(hint);

    exportKeyBtn.addEventListener('click', () => {
      exportSingleKey(seedHash);
      keyExported = true;
      exportKeyBtn.classList.remove('btn-pulse');
      exportKeyBtn.textContent = 'Key Exported';
      exportKeyBtn.disabled = true;
      exportDocBtn.style.opacity = '1';
      exportDocBtn.style.pointerEvents = 'auto';
    });

    exportDocBtn.addEventListener('click', async () => {
      editor.destroy();
      editor.createDocument(assignmentName, { seeded: true, seedHash });
      titleInput.value = assignmentName;
      await editor.save();
      exportToJSON(editor.getDocument());
      updatePlaceholder();
      modal.close();
      showNotification('Assignment created and starter document exported.', 'success');
    });
  });
});

// --- Manage Keys ---

document.getElementById('btn-keys').addEventListener('click', () => {
  openKeysModal();
});

function openKeysModal() {
  const body = createElement('div', {}, []);

  const warning = createElement('p', {
    className: 'text-sm',
    style: 'background: #fffbeb; border: 1px solid #fbbf24; border-radius: 6px; padding: 0.75rem; margin-bottom: 1rem; line-height: 1.5;',
    textContent: 'Your assignment keys are stored in this browser only. Export them and keep the backup safe. Without your keys, submitted documents cannot be verified.',
  });
  body.appendChild(warning);

  const keys = listKeys();

  if (keys.length === 0) {
    body.appendChild(createElement('p', { className: 'text-muted', textContent: 'No assignment keys stored.' }));
  } else {
    const list = createElement('ul', { className: 'key-list' });
    for (const key of keys) {
      const item = createElement('li', { className: 'key-item' }, [
        createElement('div', {}, [
          createElement('div', { className: 'key-item-name', textContent: key.assignmentName }),
          createElement('div', { className: 'key-item-meta', textContent: key.seedHash.slice(0, 12) + '...' }),
          createElement('div', {
            className: 'text-xs text-muted',
            textContent: key.createdAt ? new Date(key.createdAt).toLocaleDateString() : '',
          }),
        ]),
        createElement('button', {
          className: 'btn btn-secondary btn-sm',
          textContent: 'Export',
          onClick: () => exportSingleKey(key.seedHash),
        }),
      ]);
      list.appendChild(item);
    }
    body.appendChild(list);
  }

  const actions = createElement('div', {
    className: 'flex gap-1',
    style: 'margin-top: 1rem; justify-content: flex-end;',
  });

  if (keys.length > 0) {
    actions.appendChild(createElement('button', {
      className: 'btn btn-secondary btn-sm',
      textContent: 'Export All',
      onClick: () => {
        exportAllKeys();
        showNotification('All keys exported.', 'success');
      },
    }));
  }

  actions.appendChild(createElement('button', {
    className: 'btn btn-primary btn-sm',
    textContent: 'Import Keys',
    onClick: () => keyFileInput.click(),
  }));

  body.appendChild(actions);

  const modal = showModal('Assignment Keys', body);

  // Handle key file import
  const handleImport = safe(async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const count = await importKeysFromJSON(file);
      showNotification(`Imported ${count} key(s).`, 'success');
      modal.close();
      openKeysModal(); // Refresh
    } catch (err) {
      showNotification(err.message, 'error');
    }
    keyFileInput.value = '';
    keyFileInput.removeEventListener('change', handleImport);
  });
  keyFileInput.addEventListener('change', handleImport);
}

// --- Init ---

try {
  init();
  initLinkFeature(textarea, editor);
  initWelcome();
  if (hasAnyKeys()) showInstructorUI();
  console.log('[WriteProof] Editor initialized');
} catch (err) {
  console.error('[WriteProof] Failed to initialize:', err);
  showNotification('Failed to initialize editor. Check browser console.', 'error', 10000);
}
