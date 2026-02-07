// Export, import, and URL sharing for WriteProof

export function exportToJSON(doc) {
  const exportData = {
    version: '2.0',
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    lastModified: doc.lastModified,
    content: doc.content,
    links: doc.links || [],
    keystrokeLog: doc.keystrokeLog,
    chainHash: doc.chainHash,
    metadata: doc.metadata,
  };

  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `${sanitizeFilename(doc.title)}.writeproof.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function importFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        const doc = validateImport(data);
        resolve(doc);
      } catch (err) {
        reject(new Error(`Invalid file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function importFromString(jsonString) {
  const data = JSON.parse(jsonString);
  return validateImport(data);
}

function validateImport(data) {
  if (!data || typeof data !== 'object') throw new Error('Not a valid object');
  if (!data.id) throw new Error('Missing document id');
  if (!data.keystrokeLog || !Array.isArray(data.keystrokeLog)) {
    throw new Error('Missing or invalid keystrokeLog');
  }

  // Normalize to full document structure
  return {
    id: data.id,
    title: data.title || 'Imported Document',
    createdAt: data.createdAt || new Date().toISOString(),
    lastModified: data.lastModified || new Date().toISOString(),
    content: data.content || '',
    links: data.links || [],
    keystrokeLog: data.keystrokeLog,
    chainHash: data.chainHash || '',
    metadata: data.metadata || {
      totalKeystrokes: data.keystrokeLog.length,
      totalTime: 0,
      wordCount: 0,
      characterCount: (data.content || '').length,
    },
  };
}

function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_') || 'document';
}

export async function generateShareURL(doc) {
  const { compressToEncodedURIComponent } = await import('../vendor/lz-string.min.js');
  const exportData = {
    version: '2.0',
    id: doc.id,
    title: doc.title,
    createdAt: doc.createdAt,
    lastModified: doc.lastModified,
    content: doc.content,
    links: doc.links || [],
    keystrokeLog: doc.keystrokeLog,
    chainHash: doc.chainHash,
    metadata: doc.metadata,
  };

  const json = JSON.stringify(exportData);
  const compressed = compressToEncodedURIComponent(json);
  // Encode + as %2B so URLSearchParams.get() doesn't convert it to space
  const encoded = compressed.replace(/\+/g, '%2B');
  // Build URL relative to current page location so it works in subdirectories
  const base = window.location.href.substring(0, window.location.href.lastIndexOf('/') + 1);
  const url = `${base}verify.html?data=${encoded}`;

  if (url.length > 100000) {
    throw new Error('Document is too large for URL sharing. Please use file export instead.');
  }

  return url;
}

export async function parseShareURL(urlString) {
  const { decompressFromEncodedURIComponent } = await import('../vendor/lz-string.min.js');
  const url = new URL(urlString);
  const data = url.searchParams.get('data');
  if (!data) return null;

  const json = decompressFromEncodedURIComponent(data);
  if (!json) throw new Error('Failed to decompress shared data');

  return importFromString(json);
}
