// Page-specific rendering for WriteProof

import { createElement } from './components.js';
import { timeSince, formatNumber } from '../utils/helpers.js';

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

export function renderScoreDisplay(score, stats) {
  const container = createElement('div', { className: 'score-container' });

  // Gauge
  const percent = score.total;
  const color = percent >= 75 ? 'var(--color-success)'
    : percent >= 50 ? '#eab308'
    : percent >= 25 ? 'var(--color-warning)'
    : 'var(--color-danger)';

  const gauge = createElement('div', { className: 'score-gauge' });
  gauge.style.background = `conic-gradient(${color} ${percent * 3.6}deg, var(--color-gray-100) 0deg)`;

  const inner = createElement('div', { className: 'score-gauge-inner' });
  inner.appendChild(createElement('div', { className: 'score-value', textContent: String(percent) }));
  inner.appendChild(createElement('div', { className: 'score-label', textContent: 'out of 100' }));
  gauge.appendChild(inner);
  container.appendChild(gauge);

  // Interpretation
  container.appendChild(createElement('p', {
    className: 'score-interpretation',
    textContent: score.interpretation,
  }));

  // Breakdown
  const breakdown = createElement('div', { className: 'score-breakdown' });
  const metrics = [
    { name: 'Non-linearity', value: score.breakdown.nonLinearity, max: 30, desc: 'Cursor movement and editing pattern' },
    { name: 'Revision intensity', value: score.breakdown.revision, max: 25, desc: 'Deletion and rewriting frequency' },
    { name: 'Pause variability', value: score.breakdown.pauseVariability, max: 25, desc: 'Variation in typing rhythm' },
    { name: 'Paste analysis', value: score.breakdown.pasteAnalysis, max: 20, desc: 'Amount of pasted content' },
  ];

  for (const m of metrics) {
    const pct = (m.value / m.max) * 100;
    const barColor = pct >= 75 ? 'score-bar-green'
      : pct >= 50 ? 'score-bar-yellow'
      : pct >= 25 ? 'score-bar-orange'
      : 'score-bar-red';

    const metric = createElement('div', { className: 'score-metric' });

    const header = createElement('div', { className: 'score-metric-header' });
    header.appendChild(createElement('span', { className: 'score-metric-name', textContent: m.name }));
    header.appendChild(createElement('span', { className: 'score-metric-value', textContent: `${m.value} / ${m.max}` }));
    metric.appendChild(header);

    const bar = createElement('div', { className: 'score-bar' });
    const fill = createElement('div', { className: `score-bar-fill ${barColor}` });
    fill.style.width = `${pct}%`;
    bar.appendChild(fill);
    metric.appendChild(bar);

    metric.appendChild(createElement('div', { className: 'score-metric-desc', textContent: m.desc }));
    breakdown.appendChild(metric);
  }
  container.appendChild(breakdown);

  // Statistics table
  if (stats) {
    const statsSection = createElement('div', { className: 'score-stats' });
    const table = document.createElement('table');
    const rows = [
      ['Total keystrokes', formatNumber(stats.totalKeystrokes)],
      ['Insertions', formatNumber(stats.insertions)],
      ['Deletions', formatNumber(stats.deletions)],
      ['Pastes', formatNumber(stats.pastes)],
      ['Average typing speed', `${stats.wpm} WPM`],
      ['Session duration', stats.duration],
      ['Hash checkpoints', `${formatNumber(stats.checkpoints)} (${stats.checkpointsValid ? 'all valid' : 'some invalid'})`],
    ];
    for (const [label, value] of rows) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${label}</td><td>${value}</td>`;
      table.appendChild(tr);
    }
    statsSection.appendChild(table);
    container.appendChild(statsSection);
  }

  return container;
}
