// Web Worker for SHA-256 hash computation
// Offloads expensive crypto operations from the main thread

async function generateContentHash(content) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback for non-secure contexts
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

async function computeEventHash(prevHash, event) {
  const data = `${prevHash}|${event.t}|${event.y}|${event.p}|${event.c || ''}`;
  return generateContentHash(data);
}

// Handle messages from main thread
// Supports two operations:
//   { type: 'hashBatch', id, prevHash, events } — hash a batch of events
//   { type: 'verify', id, keystrokeLog, chainHash, content } — full verification
self.onmessage = async (e) => {
  const { type, id } = e.data;

  if (type === 'hashBatch') {
    const { prevHash, events } = e.data;
    let hash = prevHash;
    for (const evt of events) {
      hash = await computeEventHash(hash, evt);
    }
    self.postMessage({ id, type: 'hashBatchResult', hash });
  } else if (type === 'verify') {
    const { keystrokeLog, chainHash, content } = e.data;

    if (!keystrokeLog || keystrokeLog.length === 0) {
      self.postMessage({
        id,
        type: 'verifyResult',
        result: {
          isValid: !chainHash,
          chainValid: !chainHash,
          contentValid: content === '',
          replayedContent: '',
        },
      });
      return;
    }

    let replayContent = '';
    let prevHash = '0';

    for (const event of keystrokeLog) {
      if (event.y === 'i' || event.y === 'p') {
        replayContent = replayContent.slice(0, event.p) + event.c + replayContent.slice(event.p);
      } else if (event.y === 'd') {
        replayContent = replayContent.slice(0, event.p) + replayContent.slice(event.p + event.c.length);
      }
      prevHash = await computeEventHash(prevHash, event);
    }

    const chainValid = prevHash === chainHash;
    const contentValid = replayContent === content;

    self.postMessage({
      id,
      type: 'verifyResult',
      result: {
        isValid: chainValid && contentValid,
        chainValid,
        contentValid,
        replayedContent: replayContent,
      },
    });
  }
};
