// Per-event dimension computation for compare scatter plots

export const DIMENSIONS = [
  { id: 'normalizedTime', label: 'Normalized Time', unit: '' },
  { id: 'docPosition', label: 'Document Position', unit: '' },
  { id: 'typingSpeed', label: 'Typing Speed', unit: 'chars/min' },
  { id: 'interEventInterval', label: 'Inter-Event Interval', unit: 'ms' },
  { id: 'cumDeletionRatio', label: 'Cumul. Deletion Ratio', unit: '' },
  { id: 'cumPastePercent', label: 'Cumul. Paste %', unit: '%' },
  { id: 'editLocality', label: 'Edit Locality', unit: '%' },
];

/**
 * Compute a single dimension array for a document's keystroke log.
 * Returns a Float64Array with one value per event.
 */
export function computeDimension(dimensionId, doc) {
  const events = doc.keystrokeLog;
  const n = events.length;
  if (n === 0) return new Float64Array(0);

  switch (dimensionId) {
    case 'normalizedTime': return computeNormalizedTime(events);
    case 'docPosition': return computeDocPosition(events, doc);
    case 'typingSpeed': return computeTypingSpeed(events);
    case 'interEventInterval': return computeInterEventInterval(events);
    case 'cumDeletionRatio': return computeCumDeletionRatio(events);
    case 'cumPastePercent': return computeCumPastePercent(events);
    case 'editLocality': return computeEditLocality(events);
    default: return new Float64Array(n);
  }
}

function computeNormalizedTime(events) {
  const n = events.length;
  const out = new Float64Array(n);
  const maxT = events[n - 1].t;
  if (maxT === 0) return out;
  for (let i = 0; i < n; i++) {
    out[i] = events[i].t / maxT;
  }
  return out;
}

function computeDocPosition(events, doc) {
  const n = events.length;
  const out = new Float64Array(n);
  const finalLen = doc.content.length || 1;
  for (let i = 0; i < n; i++) {
    out[i] = events[i].p / finalLen;
  }
  return out;
}

function computeTypingSpeed(events) {
  const n = events.length;
  const out = new Float64Array(n);
  const WINDOW = 20;

  for (let i = 0; i < n; i++) {
    const start = Math.max(0, i - WINDOW + 1);
    let chars = 0;
    for (let j = start; j <= i; j++) {
      if (events[j].y === 'i' || events[j].y === 'p') {
        chars += events[j].c.length;
      }
    }
    const dt = events[i].t - events[start].t;
    out[i] = dt > 0 ? (chars / dt) * 60000 : 0;
  }
  return out;
}

function computeInterEventInterval(events) {
  const n = events.length;
  const out = new Float64Array(n);
  for (let i = 1; i < n; i++) {
    out[i] = events[i].t - events[i - 1].t;
  }
  return out;
}

function computeCumDeletionRatio(events) {
  const n = events.length;
  const out = new Float64Array(n);
  let cumIns = 0;
  let cumDel = 0;
  for (let i = 0; i < n; i++) {
    if (events[i].y === 'i' || events[i].y === 'p') cumIns++;
    else if (events[i].y === 'd') cumDel++;
    out[i] = cumIns > 0 ? cumDel / cumIns : 0;
  }
  return out;
}

function computeCumPastePercent(events) {
  const n = events.length;
  const out = new Float64Array(n);
  let cumPastedChars = 0;
  let cumInsertedChars = 0;
  for (let i = 0; i < n; i++) {
    if (events[i].y === 'p') {
      cumPastedChars += events[i].c.length;
      cumInsertedChars += events[i].c.length;
    } else if (events[i].y === 'i') {
      cumInsertedChars += events[i].c.length;
    }
    out[i] = cumInsertedChars > 0 ? (cumPastedChars / cumInsertedChars) * 100 : 0;
  }
  return out;
}

function computeEditLocality(events) {
  const n = events.length;
  const out = new Float64Array(n);
  const WINDOW = 20;

  // Only consider content events (not 'm' = cursor move only)
  // But output array has one entry per event, so non-content events get 0
  const contentIndices = [];
  for (let i = 0; i < n; i++) {
    if (events[i].y !== 'm') contentIndices.push(i);
  }

  // Map: for each contentIndices slot, count near edits in rolling window
  for (let ci = 0; ci < contentIndices.length; ci++) {
    const idx = contentIndices[ci];
    const wStart = Math.max(0, ci - WINDOW + 1);
    let near = 0;
    let total = 0;
    for (let j = wStart + 1; j <= ci; j++) {
      const posDiff = Math.abs(events[contentIndices[j]].p - events[contentIndices[j - 1]].p);
      total++;
      if (posDiff <= 5) near++;
    }
    out[idx] = total > 0 ? (near / total) * 100 : 0;
  }
  return out;
}
