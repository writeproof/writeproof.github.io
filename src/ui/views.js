// Page-specific rendering for WriteProof

import { createElement } from './components.js';
import { timeSince, formatNumber, formatTime } from '../utils/helpers.js';

export function renderDocumentList(documents, { onOpen, onDelete, onReplay }) {
  const container = document.createElement('div');

  if (documents.length === 0) {
    const empty = createElement('p', {
      className: 'text-muted text-center',
      textContent: 'No documents yet. Create one to get started.',
    });
    empty.style.padding = '2rem 0';
    container.appendChild(empty);
    return container;
  }

  const list = createElement('ul', { className: 'doc-list' });

  for (const doc of documents) {
    const item = createElement('li', { className: 'doc-item' });

    const info = createElement('div', { className: 'doc-item-info' });
    info.appendChild(
      createElement('div', { className: 'doc-item-title', textContent: doc.title })
    );
    info.appendChild(
      createElement('div', {
        className: 'doc-item-meta',
        textContent: `${formatNumber(doc.wordCount)} words \u00b7 ${formatNumber(doc.keystrokeCount)} keystrokes \u00b7 ${timeSince(doc.lastModified)}`,
      })
    );

    const actions = createElement('div', { className: 'doc-item-actions' });

    const openBtn = createElement('button', {
      className: 'btn btn-sm btn-secondary',
      textContent: 'Open',
      onClick: (e) => { e.stopPropagation(); onOpen(doc.id); },
    });
    actions.appendChild(openBtn);

    if (onReplay) {
      const replayBtn = createElement('button', {
        className: 'btn btn-sm btn-outline',
        textContent: 'Replay',
        onClick: (e) => { e.stopPropagation(); onReplay(doc.id); },
      });
      actions.appendChild(replayBtn);
    }

    const deleteBtn = createElement('button', {
      className: 'btn btn-sm btn-icon',
      innerHTML: '&#128465;',
      title: 'Delete',
      'aria-label': 'Delete document',
      onClick: (e) => {
        e.stopPropagation();
        if (confirm(`Delete "${doc.title}"?`)) onDelete(doc.id);
      },
    });
    actions.appendChild(deleteBtn);

    item.appendChild(info);
    item.appendChild(actions);
    item.addEventListener('click', () => onOpen(doc.id));
    list.appendChild(item);
  }

  container.appendChild(list);
  return container;
}

export function renderWritingProfile(profile) {
  const container = createElement('div', { className: 'profile-container' });

  if (!profile) {
    container.appendChild(createElement('p', {
      className: 'text-muted text-center',
      textContent: 'Not enough data to generate a writing profile.',
    }));
    return container;
  }

  // Helper to build a stats table
  function buildTable(rows) {
    const table = document.createElement('table');
    table.className = 'profile-table';
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
      table.appendChild(tr);
    }
    return table;
  }

  // --- Composition Stats ---
  const comp = profile.composition;
  const compSection = createElement('div', { className: 'profile-section' });
  compSection.appendChild(createElement('h4', { className: 'profile-section-title', textContent: 'Composition' }));
  compSection.appendChild(buildTable([
    ['Total keystrokes', formatNumber(comp.totalKeystrokes)],
    ['Word count', formatNumber(comp.wordCount)],
    ['Character count', formatNumber(comp.characterCount)],
    ['Insertions', formatNumber(comp.insertions)],
    ['Deletions', formatNumber(comp.deletions)],
    ['Pastes', formatNumber(comp.pastes)],
  ]));
  container.appendChild(compSection);

  // --- Pasting Behavior ---
  const paste = profile.pasting;
  const pasteSection = createElement('div', { className: 'profile-section' });
  pasteSection.appendChild(createElement('h4', { className: 'profile-section-title', textContent: 'Pasting Behavior' }));
  pasteSection.appendChild(buildTable([
    ['Paste events', formatNumber(paste.pasteCount)],
    ['Characters pasted', formatNumber(paste.totalCharsPasted)],
    ['Pasted content', `${paste.pastePercent}% of final text`],
    ['Largest single paste', `${formatNumber(paste.largestPaste)} chars`],
  ]));
  container.appendChild(pasteSection);

  // --- Editing Pattern ---
  const editing = profile.editing;
  const editSection = createElement('div', { className: 'profile-section' });
  editSection.appendChild(createElement('h4', { className: 'profile-section-title', textContent: 'Editing Pattern' }));
  editSection.appendChild(buildTable([
    ['Deletion ratio', `${editing.deletionRatio} deletions per insertion`],
    ['Local edits', `${editing.localEditPercent}% near previous position`],
    ['Non-local edits', `${editing.farEditPercent}% away from previous position`],
  ]));
  container.appendChild(editSection);

  // --- Timing Profile ---
  const timing = profile.timing;
  const timeSection = createElement('div', { className: 'profile-section' });
  timeSection.appendChild(createElement('h4', { className: 'profile-section-title', textContent: 'Timing Profile' }));
  timeSection.appendChild(buildTable([
    ['Median interval', `${formatNumber(timing.medianIntervalMs)} ms`],
    ['Longest pause', formatTime(timing.longestPauseMs)],
    ['Pauses over 30s', formatNumber(timing.pausesOver30s)],
  ]));
  container.appendChild(timeSection);

  return container;
}
