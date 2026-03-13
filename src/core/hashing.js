// SHA-256 hashing and event hash chain for WriteProof

let _worker = null;
let _msgId = 0;

function getWorker() {
  if (!_worker) {
    try {
      const workerUrl = new URL('../workers/hash-worker.js', import.meta.url);
      _worker = new Worker(workerUrl, { type: 'module' });
    } catch {
      // Worker creation may fail in some environments
      _worker = null;
    }
  }
  return _worker;
}

function postToWorker(msg) {
  return new Promise((resolve, reject) => {
    const worker = getWorker();
    if (!worker) {
      reject(new Error('Worker not available'));
      return;
    }
    const id = ++_msgId;
    const handler = (e) => {
      if (e.data.id === id) {
        worker.removeEventListener('message', handler);
        resolve(e.data);
      }
    };
    worker.addEventListener('message', handler);
    worker.postMessage({ ...msg, id });
  });
}

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

export async function computeEventHash(prevHash, event) {
  const data = `${prevHash}|${event.t}|${event.y}|${event.p}|${event.c || ''}`;
  return generateContentHash(data);
}

// Checkpoint interval — store content + hash state every N events
const CHECKPOINT_INTERVAL = 1000;

// Build checkpoints for a document's keystroke log.
// Each checkpoint stores { index, content, hash } at every CHECKPOINT_INTERVAL events.
// Stored on doc.checkpoints for reuse across verification calls.
export async function buildCheckpoints(doc) {
  const { insertAt, deleteAt } = await import('../utils/helpers.js');
  const checkpoints = [];
  let content = '';
  let hash = (doc.seeded && doc.seedHash) ? doc.seedHash : '0';

  for (let i = 0; i < doc.keystrokeLog.length; i++) {
    const event = doc.keystrokeLog[i];
    if (event.y === 'i' || event.y === 'p') {
      content = insertAt(content, event.p, event.c);
    } else if (event.y === 'd') {
      content = deleteAt(content, event.p, event.c.length);
    }
    hash = await computeEventHash(hash, event);

    if ((i + 1) % CHECKPOINT_INTERVAL === 0) {
      checkpoints.push({ index: i + 1, content, hash });
    }
  }

  doc.checkpoints = checkpoints;
  return checkpoints;
}

export async function verifyDocument(doc) {
  // Try worker-based verification first (non-blocking)
  try {
    const result = await postToWorker({
      type: 'verify',
      keystrokeLog: doc.keystrokeLog,
      chainHash: doc.chainHash,
      content: doc.content,
      seedHash: (doc.seeded && doc.seedHash) ? doc.seedHash : null,
    });
    return result.result;
  } catch {
    // Fall back to main-thread verification
  }

  return verifyDocumentMainThread(doc);
}

async function verifyDocumentMainThread(doc) {
  const { insertAt, deleteAt } = await import('../utils/helpers.js');

  if (!doc.keystrokeLog || doc.keystrokeLog.length === 0) {
    return {
      isValid: !doc.chainHash,
      chainValid: !doc.chainHash,
      contentValid: doc.content === '',
      replayedContent: '',
    };
  }

  // Use the latest valid checkpoint to skip already-verified events
  let startIndex = 0;
  let replayContent = '';
  let prevHash = (doc.seeded && doc.seedHash) ? doc.seedHash : '0';

  if (doc.checkpoints && doc.checkpoints.length > 0) {
    const cp = doc.checkpoints[doc.checkpoints.length - 1];
    if (cp.index <= doc.keystrokeLog.length) {
      startIndex = cp.index;
      replayContent = cp.content;
      prevHash = cp.hash;
    }
  }

  // Replay remaining events from checkpoint
  for (let i = startIndex; i < doc.keystrokeLog.length; i++) {
    const event = doc.keystrokeLog[i];
    if (event.y === 'i' || event.y === 'p') {
      replayContent = insertAt(replayContent, event.p, event.c);
    } else if (event.y === 'd') {
      replayContent = deleteAt(replayContent, event.p, event.c.length);
    }
    prevHash = await computeEventHash(prevHash, event);
  }

  const chainValid = prevHash === doc.chainHash;
  const contentValid = replayContent === doc.content;

  return {
    isValid: chainValid && contentValid,
    chainValid,
    contentValid,
    replayedContent: replayContent,
  };
}
