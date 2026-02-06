// Authenticity score calculation for WriteProof

export function calculateAuthenticityScore(doc) {
  const keystrokes = doc.keystrokeLog;

  if (!keystrokes || keystrokes.length < 2) {
    return {
      total: 0,
      breakdown: { nonLinearity: 0, revision: 0, pauseVariability: 0, pasteAnalysis: 0 },
      interpretation: getInterpretation(0),
    };
  }

  // 1. Non-linearity Score (0-30)
  // Measures cursor jumps > 5 positions
  let nonSequentialEdits = 0;
  for (let i = 1; i < keystrokes.length; i++) {
    const positionDiff = Math.abs(keystrokes[i].position - keystrokes[i - 1].position);
    if (positionDiff > 5) {
      nonSequentialEdits++;
    }
  }
  const nonLinearityScore = Math.min(30, (nonSequentialEdits / keystrokes.length) * 30);

  // 2. Revision Intensity (0-25)
  // Measures deletion frequency relative to insertion
  const deletions = keystrokes.filter((k) => k.type === 'delete').length;
  const insertions = keystrokes.filter((k) => k.type === 'insert' || k.type === 'paste').length;
  const revisionScore = insertions > 0 ? Math.min(25, (deletions / insertions) * 50) : 0;

  // 3. Pause Pattern Variability (0-25)
  // Measures coefficient of variation of inter-keystroke intervals
  const intervals = [];
  for (let i = 1; i < keystrokes.length; i++) {
    const interval = keystrokes[i].timestamp - keystrokes[i - 1].timestamp;
    // Cap intervals at 30s to avoid outlier distortion
    if (interval > 0 && interval < 30000) {
      intervals.push(interval);
    }
  }

  let pauseScore = 0;
  if (intervals.length > 1) {
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    if (mean > 0) {
      const variance =
        intervals.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / intervals.length;
      const stdDev = Math.sqrt(variance);
      const cv = stdDev / mean;
      pauseScore = Math.min(25, cv * 100);
    }
  }

  // 4. Paste Detection Penalty (0-20)
  // Penalizes large paste operations
  const pastedChars = keystrokes
    .filter((k) => k.type === 'paste')
    .reduce((sum, k) => sum + k.length, 0);
  const totalChars = doc.content.length || 1;
  const pasteScore = Math.max(0, 20 - (pastedChars / totalChars) * 20);

  const totalScore = Math.round(
    nonLinearityScore + revisionScore + pauseScore + pasteScore
  );

  return {
    total: Math.max(0, Math.min(100, totalScore)),
    breakdown: {
      nonLinearity: Math.round(nonLinearityScore),
      revision: Math.round(revisionScore),
      pauseVariability: Math.round(pauseScore),
      pasteAnalysis: Math.round(pasteScore),
    },
    interpretation: getInterpretation(totalScore),
  };
}

function getInterpretation(score) {
  if (score >= 75)
    return 'High confidence \u2014 Strong indicators of authentic human writing';
  if (score >= 50)
    return 'Moderate confidence \u2014 Mostly consistent with human writing patterns';
  if (score >= 25)
    return 'Low confidence \u2014 Some concerning patterns detected';
  return 'Very low confidence \u2014 Patterns inconsistent with typical human writing';
}
