// Entry point for verify.html — WriteProof verification and replay

import { loadDocument } from './core/storage.js';
import { verifyDocument } from './core/hashing.js';
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
const statusChain = document.getElementById('status-chain');
const scoreSection = document.getElementById('score-section');

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

  // Switch to replay screen
  importScreen.style.display = 'none';
  replayScreen.style.display = 'flex';

  replayTitle.textContent = doc.title || 'Untitled Document';
  replayMeta.textContent = `${formatNumber(doc.keystrokeLog.length)} keystrokes \u00b7 ${formatNumber(countWords(doc.content))} words \u00b7 Created ${new Date(doc.createdAt).toLocaleDateString()}`;

  statusKeystroke.textContent = `0 / ${formatNumber(doc.keystrokeLog.length)}`;
  statusChain.textContent = doc.chainHash ? 'Not verified' : 'No chain';

  // Initialize replay engine
  engine = new ReplayEngine(doc, {
    speed: parseFloat(speedSelect.value),
    onProgress: handleProgress,
    onComplete: handleComplete,
    onStateChange: handleStateChange,
  });

  replayTextarea.textContent = '';
}

function handleProgress({ index, total, content, position, timestamp }) {
  replayTextarea.textContent = content;

  replayTextarea.scrollTop = replayTextarea.scrollHeight;

  const pct = (index / total) * 100;
  progressFill.style.width = `${pct}%`;
  progressBar.setAttribute('aria-valuenow', Math.round(pct));
  progressLabel.textContent = `${formatNumber(index)} / ${formatNumber(total)}`;
  statusKeystroke.textContent = `${formatNumber(index)} / ${formatNumber(total)}`;
  statusTime.textContent = formatTime(timestamp);
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
  showNotification('Verifying hash chain...', 'info', 10000);

  const results = await verifyDocument(currentDoc);

  if (results.isValid) {
    statusHash.textContent = 'Valid';
    statusHash.className = 'badge badge-success';
    statusChain.textContent = 'Valid';
    statusChain.className = 'badge badge-success';
    showNotification('Verification passed: chain and content valid', 'success');
  } else {
    statusHash.textContent = 'Invalid';
    statusHash.className = 'badge badge-danger';
    const parts = [];
    if (!results.chainValid) parts.push('Chain mismatch');
    if (!results.contentValid) parts.push('Content mismatch');
    statusChain.textContent = results.chainValid ? 'Valid' : 'Invalid';
    statusChain.className = results.chainValid ? 'badge badge-success' : 'badge badge-danger';
    showNotification(`Verification FAILED: ${parts.join(', ')}`, 'error', 5000);
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
  scoreSection.style.display = 'none';
  replayTextarea.textContent = '';
  progressFill.style.width = '0%';
  statusHash.textContent = 'Not verified';
  statusHash.className = 'badge badge-info';
  statusChain.textContent = 'Not verified';
  statusChain.className = '';
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
