// Entry point for verify.html — WriteProof verification and replay

import { loadDocument } from './core/storage.js';
import { verifyDocument } from './core/hashing.js';
import { importFromJSON, parseShareURL } from './features/export.js';
import { ReplayEngine } from './features/replay.js';
import { calculateAuthenticityScore } from './features/analytics.js';
import { showNotification } from './ui/components.js';
import { renderScoreDisplay } from './ui/views.js';
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
const statusCheckpoints = document.getElementById('status-checkpoints');
const scoreSection = document.getElementById('score-section');

let engine = null;
let currentDoc = null;
let verifiedCheckpoints = 0;
let totalCheckpoints = 0;

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
  verifiedCheckpoints = 0;
  totalCheckpoints = doc.hashChain.length;

  // Switch to replay screen
  importScreen.style.display = 'none';
  replayScreen.style.display = 'flex';

  replayTitle.textContent = doc.title || 'Untitled Document';
  replayMeta.textContent = `${formatNumber(doc.keystrokeLog.length)} keystrokes \u00b7 ${formatNumber(countWords(doc.content))} words \u00b7 Created ${new Date(doc.createdAt).toLocaleDateString()}`;

  statusKeystroke.textContent = `0 / ${formatNumber(doc.keystrokeLog.length)}`;
  statusCheckpoints.textContent = `0 / ${formatNumber(totalCheckpoints)}`;

  // Initialize replay engine
  engine = new ReplayEngine(doc, {
    speed: parseFloat(speedSelect.value),
    onProgress: handleProgress,
    onHashCheck: handleHashCheck,
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

function handleHashCheck({ valid }) {
  if (valid) {
    verifiedCheckpoints++;
  }
  statusCheckpoints.textContent = `${verifiedCheckpoints} / ${formatNumber(totalCheckpoints)}`;
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
      verifiedCheckpoints = 0;
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
    showNotification(`Hash chain verified: ${results.validCheckpoints}/${results.totalCheckpoints} checkpoints valid`, 'success');
  } else {
    statusHash.textContent = 'Invalid';
    statusHash.className = 'badge badge-danger';
    showNotification(`Hash chain INVALID: ${results.invalidCheckpoints.length} errors found`, 'error', 5000);
  }

  statusCheckpoints.textContent = `${results.validCheckpoints} / ${results.totalCheckpoints}`;
});

// Score
document.getElementById('btn-show-score').addEventListener('click', () => {
  if (!currentDoc || currentDoc.keystrokeLog.length < 2) {
    showNotification('Not enough data for scoring', 'warning');
    return;
  }

  const score = calculateAuthenticityScore(currentDoc);
  const insertions = currentDoc.keystrokeLog.filter((k) => k.type === 'insert').length;
  const deletions = currentDoc.keystrokeLog.filter((k) => k.type === 'delete').length;
  const pastes = currentDoc.keystrokeLog.filter((k) => k.type === 'paste').length;
  const totalTime = currentDoc.metadata?.totalTime || 0;
  const wpm = totalTime > 0 ? Math.round(countWords(currentDoc.content) / (totalTime / 60000)) : 0;

  const stats = {
    totalKeystrokes: currentDoc.keystrokeLog.length,
    insertions,
    deletions,
    pastes,
    wpm,
    duration: formatTime(totalTime),
    checkpoints: currentDoc.hashChain.length,
    checkpointsValid: true,
  };

  scoreSection.innerHTML = '';
  scoreSection.appendChild(renderScoreDisplay(score, stats));
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

  // Load from shared URL data
  const data = params.get('data');
  if (data) {
    try {
      const doc = await parseShareURL(window.location.href);
      if (doc) {
        loadDoc(doc);
        return;
      }
    } catch (err) {
      showNotification(`Failed to load shared document: ${err.message}`, 'error');
    }
  }
}

init();
