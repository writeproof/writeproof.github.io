// Entry point for verify.html — WriteProof verification and replay

import { loadDocument } from './core/storage.js';
import { verifyDocument, generateContentHash } from './core/hashing.js';
import { loadKey, importKeysFromJSON, importKeyFromPasscode } from './core/keys.js';
import { importFromJSON } from './features/export.js';
import { ReplayEngine } from './features/replay.js';
import { analyzeWritingProfile } from './features/analytics.js';
import { showNotification } from './ui/components.js';
import { renderWritingProfile } from './ui/views.js';
import { formatTime, formatNumber, countWords } from './utils/helpers.js';

// DOM
const importScreen = document.getElementById('import-screen');
const replayScreen = document.getElementById('replay-screen');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('verify-file-input');
const importError = document.getElementById('import-error');
const replayTitle = document.getElementById('replay-title');
const replayMeta = document.getElementById('replay-meta');
const replayTextarea = document.getElementById('replay-textarea');
const btnPlay = document.getElementById('btn-play');
const speedSelect = document.getElementById('speed-select');
const progressBar = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const progressLabel = document.getElementById('progress-label');
const statusTime = document.getElementById('status-time');
const statusKeystroke = document.getElementById('status-keystroke');
const statusHash = document.getElementById('status-hash');
const scoreSection = document.getElementById('score-section');
const eventTypeBadge = document.getElementById('event-type-badge');
const eventContentEl = document.getElementById('event-content');
const seededBadge = document.getElementById('seeded-badge');
const keyImportPanel = document.getElementById('key-import-panel');
const keyDropZone = document.getElementById('key-drop-zone');
const keyFileInput = document.getElementById('key-file-verify-input');
const passcodeInput = document.getElementById('passcode-input');
const btnPasscodeSubmit = document.getElementById('btn-passcode-submit');

let engine = null;
let currentDoc = null;

// --- Import Handling ---

dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('drag-over');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleFile(file);
});

fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleFile(file);
  fileInput.value = '';
});

async function handleFile(file) {
  importError.style.display = 'none';
  try {
    const doc = await importFromJSON(file);
    loadDoc(doc);
  } catch (err) {
    importError.textContent = err.message;
    importError.style.display = 'block';
  }
}

function loadDoc(doc) {
  currentDoc = doc;

  // Check if seeded and whether we have the key
  if (doc.seeded && doc.seedHash) {
    seededBadge.style.display = 'inline-flex';
    const key = loadKey(doc.seedHash);
    if (!key) {
      // Show key import panel — stay on import screen
      keyImportPanel.style.display = 'block';
      return;
    }
  } else {
    seededBadge.style.display = 'none';
  }

  // Key resolved (or not seeded) — switch to replay screen
  keyImportPanel.style.display = 'none';
  importScreen.style.display = 'none';
  replayScreen.style.display = 'flex';

  replayTitle.textContent = doc.title || 'Untitled Document';
  replayMeta.textContent = `${formatNumber(doc.keystrokeLog.length)} keystrokes \u00b7 ${formatNumber(countWords(doc.content))} words \u00b7 Created ${new Date(doc.createdAt).toLocaleDateString()}`;

  statusKeystroke.textContent = `0 / ${formatNumber(doc.keystrokeLog.length)}`;

  // Initialize replay engine
  engine = new ReplayEngine(doc, {
    speed: parseFloat(speedSelect.value),
    onProgress: handleProgress,
    onComplete: handleComplete,
    onStateChange: handleStateChange,
  });

  replayTextarea.textContent = '';
}

// --- Key Import on Verify Page ---

keyDropZone.addEventListener('click', () => keyFileInput.click());

keyDropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  keyDropZone.classList.add('drag-over');
});
keyDropZone.addEventListener('dragleave', () => {
  keyDropZone.classList.remove('drag-over');
});
keyDropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  keyDropZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file) handleKeyFile(file);
});

keyFileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) handleKeyFile(file);
  keyFileInput.value = '';
});

async function handleKeyFile(file) {
  try {
    const count = await importKeysFromJSON(file);
    if (count === 0) {
      showNotification('Key already exists or file did not contain new keys.', 'info');
    } else {
      showNotification(`Imported ${count} key(s).`, 'success');
    }
    // Retry loading the doc now that we have the key
    if (currentDoc) loadDoc(currentDoc);
  } catch (err) {
    showNotification(err.message, 'error');
  }
}

btnPasscodeSubmit.addEventListener('click', async () => {
  const passcode = passcodeInput.value.trim();
  if (!passcode) {
    showNotification('Please enter a passcode.', 'warning');
    return;
  }
  try {
    const { seedHash } = await importKeyFromPasscode(passcode);
    // Verify it matches the document's seedHash
    if (currentDoc && currentDoc.seedHash && seedHash !== currentDoc.seedHash) {
      showNotification('Passcode does not match this document.', 'error');
      return;
    }
    showNotification('Passcode accepted.', 'success');
    passcodeInput.value = '';
    if (currentDoc) loadDoc(currentDoc);
  } catch (err) {
    showNotification(err.message, 'error');
  }
});

passcodeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    btnPasscodeSubmit.click();
  }
});

// --- Event Indicator ---

function formatEventContent(event) {
  if (!event) return 'Waiting...';
  const c = event.c || '';
  switch (event.y) {
    case 'i': return c.length === 1 ? displayKey(c) : `"${truncate(c, 20)}"`;
    case 'd': return `\u232b "${truncate(c, 18)}"`;
    case 'p': return `"${truncate(c, 20)}"`;
    case 'm': return `pos ${event.p}`;
    default:  return '';
  }
}

function displayKey(ch) {
  if (ch === ' ') return '\u2423';        // open box
  if (ch === '\n') return '\u23ce';       // return
  if (ch === '\t') return '\u21e5';       // tab
  return `"${ch}"`;
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max) + '\u2026' : str;
}

const EVENT_LABELS = { i: 'Insert', d: 'Delete', p: 'Paste', m: 'Move' };
const EVENT_CLASSES = { i: 'evt-insert', d: 'evt-delete', p: 'evt-paste', m: 'evt-move' };

let _flashTimer = null;

function updateEventIndicator(event) {
  if (!event) return;
  const label = EVENT_LABELS[event.y] || event.y;
  const cls = EVENT_CLASSES[event.y] || '';

  eventTypeBadge.textContent = label;
  eventTypeBadge.className = `event-badge ${cls} evt-flash`;
  eventContentEl.textContent = formatEventContent(event);

  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => {
    eventTypeBadge.classList.remove('evt-flash');
  }, 120);
}

function handleProgress({ index, total, content, position, timestamp, event }) {
  replayTextarea.textContent = content;
  replayTextarea.scrollTop = replayTextarea.scrollHeight;

  const pct = (index / total) * 100;
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', Math.round(pct));
  progressLabel.textContent = `${formatNumber(index)} / ${formatNumber(total)}`;
  statusKeystroke.textContent = `${formatNumber(index)} / ${formatNumber(total)}`;
  statusTime.textContent = formatTime(timestamp);

  updateEventIndicator(event);
}

function handleComplete() {
  showNotification('Replay complete', 'success');
}

function handleStateChange(state) {
  if (state === 'playing') {
    btnPlay.innerHTML = '&#10074;&#10074; Pause';
  } else {
    btnPlay.innerHTML = '&#9654; Play';
  }
}

// --- Controls ---

btnPlay.addEventListener('click', () => {
  if (!engine) return;
  if (engine.state === 'playing') {
    engine.pause();
  } else if (engine.state === 'paused') {
    engine.resume();
  } else {
    // Reset if at end
    if (engine.index >= engine.total) {
      engine.stop();
      replayTextarea.textContent = '';
    }
    engine.play();
  }
});

speedSelect.addEventListener('change', () => {
  if (engine) engine.setSpeed(parseFloat(speedSelect.value));
});

// Click on progress bar to seek
progressBar.addEventListener('click', (e) => {
  if (!engine) return;
  const rect = progressBar.getBoundingClientRect();
  const pct = (e.clientX - rect.left) / rect.width;
  const target = Math.round(pct * engine.total);
  engine.seekTo(Math.max(0, Math.min(target, engine.total)));
  replayTextarea.textContent = engine.content;
  progressFill.style.width = `${pct * 100}%`;
});

// Space to toggle play/pause
document.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.key === ' ') {
    e.preventDefault();
    btnPlay.click();
  }
});

// Verify hashes
document.getElementById('btn-verify').addEventListener('click', async () => {
  if (!currentDoc) return;

  // For seeded docs, verify the key is available and do sanity check
  if (currentDoc.seeded && currentDoc.seedHash) {
    const key = loadKey(currentDoc.seedHash);
    if (!key) {
      showNotification('Assignment key not found. Import the key file to verify.', 'warning');
      return;
    }
    // Sanity check: verify stored passcode hashes to the document's seedHash
    const computed = await generateContentHash(key.passcode);
    if (computed !== currentDoc.seedHash) {
      showNotification('Stored key does not match document seed. Verification aborted.', 'error');
      return;
    }
  }

  showNotification('Verifying...', 'info', 10000);
  const results = await verifyDocument(currentDoc);

  if (results.isValid) {
    statusHash.textContent = 'Verified';
    statusHash.className = 'badge badge-success';
    showNotification('Verification passed', 'success');
  } else {
    statusHash.textContent = 'Not Verified';
    statusHash.className = 'badge badge-danger';
    showNotification('Verification failed — document may have been tampered with', 'error', 5000);
  }
});

// Writing Profile
document.getElementById('btn-show-score').addEventListener('click', () => {
  if (!currentDoc || currentDoc.keystrokeLog.length < 2) {
    showNotification('Not enough data for writing profile', 'warning');
    return;
  }

  const profile = analyzeWritingProfile(currentDoc);
  scoreSection.innerHTML = '';
  scoreSection.appendChild(renderWritingProfile(profile));
  scoreSection.style.display = scoreSection.style.display === 'none' ? 'block' : 'none';
});

// Back button
document.getElementById('btn-back').addEventListener('click', () => {
  if (engine) engine.stop();
  engine = null;
  currentDoc = null;
  replayScreen.style.display = 'none';
  importScreen.style.display = 'block';
  keyImportPanel.style.display = 'none';
  scoreSection.style.display = 'none';
  replayTextarea.textContent = '';
  progressFill.style.width = '0%';
  statusHash.textContent = 'Not Verified';
  statusHash.className = 'badge badge-info';
  eventTypeBadge.textContent = '--';
  eventTypeBadge.className = 'event-badge';
  eventContentEl.textContent = 'Waiting...';
  seededBadge.style.display = 'none';
  passcodeInput.value = '';
});

// --- Auto-load from URL params ---

async function init() {
  const params = new URLSearchParams(window.location.search);

  // Load from localStorage by doc ID
  const docId = params.get('doc');
  if (docId) {
    const doc = loadDocument(docId);
    if (doc) {
      loadDoc(doc);
      return;
    }
    showNotification('Document not found in local storage', 'warning');
  }
}

init();
