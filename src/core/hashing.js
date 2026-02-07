// SHA-256 hashing and event hash chain for WriteProof

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

export async function verifyDocument(doc) {
  const { insertAt, deleteAt } = await import('../utils/helpers.js');

  if (!doc.keystrokeLog || doc.keystrokeLog.length === 0) {
    return {
      isValid: !doc.chainHash,
      chainValid: !doc.chainHash,
      contentValid: doc.content === '',
      replayedContent: '',
    };
  }

  // Replay all events and recompute hash chain
  let replayContent = '';
  let prevHash = '0';

  for (const event of doc.keystrokeLog) {
    if (event.y === 'i' || event.y === 'p') {
      replayContent = insertAt(replayContent, event.p, event.c);
    } else if (event.y === 'd') {
      replayContent = deleteAt(replayContent, event.p, event.c.length);
    }
    // 'm' events don't affect content

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
