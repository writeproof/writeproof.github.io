// SHA-256 hashing and hash chain for WriteProof

export async function generateContentHash(content) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-secure contexts (HTTP without localhost)
  // Uses a simple hash — not cryptographically secure, but functional
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < content.length; i++) {
    const ch = content.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = (4294967296 * (2097151 & h2) + (h1 >>> 0));
  return hash.toString(16).padStart(16, '0');
}

export async function createHashCheckpoint(doc, content, keystrokeIndex) {
  const contentHash = await generateContentHash(content !== undefined ? content : doc.content);
  const previousCumulativeHash =
    doc.hashChain.length > 0
      ? doc.hashChain[doc.hashChain.length - 1].cumulativeHash
      : '0';

  const cumulativeHash = await generateContentHash(
    previousCumulativeHash + contentHash
  );

  const idx = keystrokeIndex !== undefined ? keystrokeIndex : doc.keystrokeLog.length - 1;
  const checkpoint = {
    timestamp: idx >= 0 && idx < doc.keystrokeLog.length
      ? doc.keystrokeLog[idx].timestamp
      : 0,
    keystrokeIndex: idx,
    contentHash,
    cumulativeHash,
  };

  doc.hashChain.push(checkpoint);
  return checkpoint;
}

export const CHECKPOINT_INTERVAL = 10;

export async function verifyDocument(doc) {
  const { insertAt, deleteAt } = await import('../utils/helpers.js');

  const results = {
    totalCheckpoints: doc.hashChain.length,
    validCheckpoints: 0,
    invalidCheckpoints: [],
    isValid: true,
  };

  if (!doc.keystrokeLog || doc.keystrokeLog.length === 0) {
    return results;
  }

  // Build a map of checkpoint keystroke indices for fast lookup
  const checkpointMap = new Map();
  for (const cp of doc.hashChain) {
    checkpointMap.set(cp.keystrokeIndex, cp);
  }

  // Replay all keystrokes and verify at checkpoints
  let replayContent = '';
  for (let i = 0; i < doc.keystrokeLog.length; i++) {
    const event = doc.keystrokeLog[i];

    if (event.type === 'insert' || event.type === 'paste') {
      replayContent = insertAt(replayContent, event.position, event.char);
    } else if (event.type === 'delete') {
      replayContent = deleteAt(replayContent, event.position, event.length);
    }

    const checkpoint = checkpointMap.get(i);
    if (checkpoint) {
      const computedHash = await generateContentHash(replayContent);
      if (computedHash === checkpoint.contentHash) {
        results.validCheckpoints++;
      } else {
        results.invalidCheckpoints.push({
          keystrokeIndex: i,
          expected: checkpoint.contentHash,
          actual: computedHash,
        });
        results.isValid = false;
      }
    }
  }

  // Verify cumulative hash chain integrity
  let previousCumulative = '0';
  for (let i = 0; i < doc.hashChain.length; i++) {
    const checkpoint = doc.hashChain[i];
    const expectedCumulative = await generateContentHash(
      previousCumulative + checkpoint.contentHash
    );

    if (expectedCumulative !== checkpoint.cumulativeHash) {
      results.isValid = false;
      results.invalidCheckpoints.push({
        type: 'cumulative_hash_mismatch',
        checkpointIndex: i,
        expected: expectedCumulative,
        actual: checkpoint.cumulativeHash,
      });
    }
    previousCumulative = checkpoint.cumulativeHash;
  }

  return results;
}
