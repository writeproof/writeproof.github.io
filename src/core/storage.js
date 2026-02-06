// localStorage persistence for WriteProof documents

const STORAGE_KEY = 'writeproof_docs';
const SCHEMA_VERSION = 1;

function getStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: SCHEMA_VERSION, documents: {} };
    const store = JSON.parse(raw);
    if (store.version !== SCHEMA_VERSION) {
      // Future: handle migrations
      return { version: SCHEMA_VERSION, documents: store.documents || {} };
    }
    return store;
  } catch {
    return { version: SCHEMA_VERSION, documents: {} };
  }
}

function setStore(store) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded');
      return false;
    }
    throw e;
  }
}

export function saveDocument(doc) {
  const store = getStore();
  store.documents[doc.id] = doc;
  return setStore(store);
}

export function loadDocument(id) {
  const store = getStore();
  return store.documents[id] || null;
}

export function deleteDocument(id) {
  const store = getStore();
  delete store.documents[id];
  return setStore(store);
}

export function listDocuments() {
  const store = getStore();
  return Object.values(store.documents)
    .map((doc) => ({
      id: doc.id,
      title: doc.title,
      createdAt: doc.createdAt,
      lastModified: doc.lastModified,
      wordCount: doc.metadata?.wordCount || 0,
      characterCount: doc.metadata?.characterCount || 0,
      keystrokeCount: doc.keystrokeLog?.length || 0,
    }))
    .sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
}

export function getStorageUsage() {
  const raw = localStorage.getItem(STORAGE_KEY) || '';
  const bytes = new Blob([raw]).size;
  return { bytes, formatted: formatBytes(bytes) };
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
