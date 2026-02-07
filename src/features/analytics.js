// Writing profile analysis for WriteProof

export function analyzeWritingProfile(doc) {
  const keystrokes = doc.keystrokeLog;

  if (!keystrokes || keystrokes.length < 2) {
    return null;
  }

  const contentEvents = keystrokes.filter((k) => k.y !== 'm');
  const insertions = keystrokes.filter((k) => k.y === 'i');
  const deletions = keystrokes.filter((k) => k.y === 'd');
  const pastes = keystrokes.filter((k) => k.y === 'p');

  // --- Composition Stats ---
  const totalKeystrokes = keystrokes.length;
  const insertionCount = insertions.length;
  const deletionCount = deletions.length;
  const pasteCount = pastes.length;

  // --- Pasting Behavior ---
  const totalCharsPasted = pastes.reduce((sum, k) => sum + k.c.length, 0);
  const totalChars = doc.content.length || 0;
  const pastePercent = totalChars > 0 ? Math.round((totalCharsPasted / totalChars) * 100) : 0;
  const largestPaste = pastes.length > 0
    ? Math.max(...pastes.map((k) => k.c.length))
    : 0;

  // --- Editing Pattern ---
  const deletionRatio = insertionCount > 0
    ? Math.round((deletionCount / insertionCount) * 100) / 100
    : 0;

  // Edit locality: how often edits are near the previous edit (within 5 chars)
  let nearEdits = 0;
  let farEdits = 0;
  for (let i = 1; i < contentEvents.length; i++) {
    const posDiff = Math.abs(contentEvents[i].p - contentEvents[i - 1].p);
    if (posDiff <= 5) {
      nearEdits++;
    } else {
      farEdits++;
    }
  }
  const totalEditMoves = nearEdits + farEdits;
  const localEditPercent = totalEditMoves > 0
    ? Math.round((nearEdits / totalEditMoves) * 100)
    : 0;

  // --- Timing Profile ---
  const intervals = [];
  for (let i = 1; i < keystrokes.length; i++) {
    const interval = keystrokes[i].t - keystrokes[i - 1].t;
    if (interval > 0) {
      intervals.push(interval);
    }
  }

  let medianInterval = 0;
  let longestPause = 0;
  let pausesOver30s = 0;

  if (intervals.length > 0) {
    const sorted = intervals.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianInterval = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid];
    medianInterval = Math.round(medianInterval);

    longestPause = Math.round(sorted[sorted.length - 1]);

    for (const interval of intervals) {
      if (interval > 30000) pausesOver30s++;
    }
  }

  return {
    composition: {
      totalKeystrokes,
      wordCount: doc.metadata?.wordCount || 0,
      characterCount: totalChars,
      insertions: insertionCount,
      deletions: deletionCount,
      pastes: pasteCount,
    },
    pasting: {
      pasteCount,
      totalCharsPasted,
      pastePercent,
      largestPaste,
    },
    editing: {
      deletionRatio,
      localEditPercent,
      farEditPercent: 100 - localEditPercent,
    },
    timing: {
      medianIntervalMs: medianInterval,
      longestPauseMs: longestPause,
      pausesOver30s,
    },
  };
}
