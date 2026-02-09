// Entry point for compare.html — multi-document scatter plot comparison

import { importFromJSON } from './features/export.js';
import { saveDocument, loadDocument } from './core/storage.js';
import { DIMENSIONS, computeDimension } from './features/dimensions.js';
import { ScatterChart, getSeriesColor } from './ui/chart.js';

// --- DOM ---
const dropZone = document.getElementById('compare-drop-zone');
const fileInput = document.getElementById('compare-file-input');
const docListEl = document.getElementById('compare-doc-list');
const xSelect = document.getElementById('x-axis-select');
const ySelect = document.getElementById('y-axis-select');
const canvas = document.getElementById('compare-canvas');
const emptyMsg = document.getElementById('compare-empty');

// --- State ---
const STORAGE_KEY = 'writeproof_compare_docs';
let documents = []; // [{ doc, color, visible, xData, yData }]
let currentXDim = 'normalizedTime';
let currentYDim = 'typingSpeed';
let chart = null;

// --- Init ---

function init() {
  populateSelects();
  chart = new ScatterChart(canvas);
  loadPersistedDocs();
  updateChart();
}

// --- Axis Selects ---

function populateSelects() {
  for (const dim of DIMENSIONS) {
    const xOpt = document.createElement('option');
    xOpt.value = dim.id;
    xOpt.textContent = dim.label + (dim.unit ? ` (${dim.unit})` : '');
    xSelect.appendChild(xOpt);

    const yOpt = xOpt.cloneNode(true);
    ySelect.appendChild(yOpt);
  }
  xSelect.value = currentXDim;
  ySelect.value = currentYDim;

  xSelect.addEventListener('change', () => {
    currentXDim = xSelect.value;
    recomputeAxis('x');
    updateChart();
  });
  ySelect.addEventListener('change', () => {
    currentYDim = ySelect.value;
    recomputeAxis('y');
    updateChart();
  });
}

// --- File Upload ---

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
  handleFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', () => {
  handleFiles(fileInput.files);
  fileInput.value = '';
});

async function handleFiles(fileList) {
  for (const file of fileList) {
    try {
      const doc = await importFromJSON(file);
      saveDocument(doc);
      addDocument(doc);
    } catch (err) {
      console.error('Import failed:', file.name, err);
    }
  }
  persistDocIds();
  updateChart();
}

// --- Document Management ---

function addDocument(doc) {
  // Replace if same ID already present
  const existing = documents.findIndex((d) => d.doc.id === doc.id);
  const colorIndex = existing >= 0 ? existing : documents.length;
  const color = getSeriesColor(colorIndex);

  const entry = {
    doc,
    color,
    visible: true,
    xData: computeDimension(currentXDim, doc),
    yData: computeDimension(currentYDim, doc),
  };

  if (existing >= 0) {
    documents[existing] = entry;
  } else {
    documents.push(entry);
  }
  renderDocList();
}

function removeDocument(id) {
  documents = documents.filter((d) => d.doc.id !== id);
  persistDocIds();
  renderDocList();
  updateChart();
}

function toggleDocument(id, visible) {
  const entry = documents.find((d) => d.doc.id === id);
  if (entry) {
    entry.visible = visible;
    chart.toggleSeries(id, visible);
  }
}

// --- Persistence ---

function persistDocIds() {
  const ids = documents.map((d) => d.doc.id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch { /* ignore */ }
}

function loadPersistedDocs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const ids = JSON.parse(raw);
    for (const id of ids) {
      const doc = loadDocument(id);
      if (doc && doc.keystrokeLog && doc.keystrokeLog.length > 0) {
        addDocument(doc);
      }
    }
  } catch { /* ignore */ }
}

// --- Dimension Recompute ---

function recomputeAxis(axis) {
  for (const entry of documents) {
    if (axis === 'x') {
      entry.xData = computeDimension(currentXDim, entry.doc);
    } else {
      entry.yData = computeDimension(currentYDim, entry.doc);
    }
  }
}

// --- Chart Update ---

function updateChart() {
  const xDim = DIMENSIONS.find((d) => d.id === currentXDim);
  const yDim = DIMENSIONS.find((d) => d.id === currentYDim);
  const xLabel = xDim ? xDim.label + (xDim.unit ? ` (${xDim.unit})` : '') : '';
  const yLabel = yDim ? yDim.label + (yDim.unit ? ` (${yDim.unit})` : '') : '';

  chart.setAxes(xLabel, yLabel);

  const series = documents.map((d) => ({
    id: d.doc.id,
    label: d.doc.title || 'Untitled',
    color: d.color,
    visible: d.visible,
    x: d.xData,
    y: d.yData,
  }));

  chart.setData(series);

  // Toggle empty message
  emptyMsg.style.display = documents.length === 0 ? 'flex' : 'none';
  canvas.style.display = documents.length === 0 ? 'none' : 'block';
}

// --- Sidebar Doc List ---

function renderDocList() {
  docListEl.innerHTML = '';
  for (const entry of documents) {
    const li = document.createElement('li');
    li.className = 'compare-doc-item';

    const dot = document.createElement('span');
    dot.className = 'compare-doc-color';
    dot.style.backgroundColor = entry.color;

    const name = document.createElement('span');
    name.className = 'compare-doc-name';
    name.textContent = entry.doc.title || 'Untitled';
    name.title = entry.doc.title || 'Untitled';

    const actions = document.createElement('span');
    actions.className = 'compare-doc-actions';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = entry.visible;
    cb.title = 'Toggle visibility';
    cb.addEventListener('change', () => toggleDocument(entry.doc.id, cb.checked));

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '&times;';
    removeBtn.title = 'Remove document';
    removeBtn.addEventListener('click', () => removeDocument(entry.doc.id));

    actions.appendChild(cb);
    actions.appendChild(removeBtn);
    li.appendChild(dot);
    li.appendChild(name);
    li.appendChild(actions);
    docListEl.appendChild(li);
  }
}

// --- Go ---
init();
