// Instructor assignment key management for WriteProof

import { generateContentHash } from './hashing.js';

const KEYS_STORAGE_KEY = 'writeproof_keys';

function getKeys() {
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function setKeys(keys) {
  try {
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(keys));
    return true;
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      console.error('localStorage quota exceeded for keys');
      return false;
    }
    throw e;
  }
}

export function generatePasscode() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function saveKey(seedHash, data) {
  const keys = getKeys();
  keys[seedHash] = data;
  return setKeys(keys);
}

export function loadKey(seedHash) {
  return getKeys()[seedHash] || null;
}

export function listKeys() {
  const keys = getKeys();
  return Object.entries(keys)
    .map(([seedHash, data]) => ({ seedHash, ...data }))
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
}

export function deleteKey(seedHash) {
  const keys = getKeys();
  delete keys[seedHash];
  return setKeys(keys);
}

export function hasAnyKeys() {
  return Object.keys(getKeys()).length > 0;
}

export function exportAllKeys() {
  const keys = getKeys();
  const backup = {
    type: 'writeproof_keys_backup',
    exportedAt: new Date().toISOString(),
    keys,
  };
  downloadJSON(backup, 'writeproof-keys-backup.json');
}

export function exportSingleKey(seedHash) {
  const keys = getKeys();
  const data = keys[seedHash];
  if (!data) return;
  const backup = {
    type: 'writeproof_key',
    seedHash,
    ...data,
  };
  const name = (data.assignmentName || 'assignment').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().replace(/\s+/g, '_');
  downloadJSON(backup, `writeproof-key-${name}.json`);
}

export function importKeysFromJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        let count = 0;
        const keys = getKeys();

        if (data.type === 'writeproof_keys_backup' && data.keys) {
          for (const [seedHash, entry] of Object.entries(data.keys)) {
            if (!keys[seedHash]) {
              keys[seedHash] = entry;
              count++;
            }
          }
        } else if (data.type === 'writeproof_key' && data.seedHash) {
          if (!keys[data.seedHash]) {
            const { type: _, seedHash, ...rest } = data;
            keys[seedHash] = rest;
            count++;
          }
        } else {
          throw new Error('Unrecognized key file format');
        }

        setKeys(keys);
        resolve(count);
      } catch (err) {
        reject(new Error(`Invalid key file: ${err.message}`));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export async function importKeyFromPasscode(passcode) {
  passcode = passcode.trim();
  if (!passcode) throw new Error('Passcode cannot be empty');
  const seedHash = await generateContentHash(passcode);
  const keys = getKeys();
  if (!keys[seedHash]) {
    keys[seedHash] = {
      assignmentName: 'Imported',
      passcode,
      createdAt: new Date().toISOString(),
    };
    setKeys(keys);
  }
  return { seedHash };
}

function downloadJSON(data, filename) {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
