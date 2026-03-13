# WriteProof: Instructor-Seeded Hash Chain

## Problem

The current chain starts from a hardcoded `prevHash = '0'`, which means anyone who reads `hash-worker.js` can replicate the chain construction and generate a fake-but-valid document.

## Solution

Replace the `'0'` initial hash with a passcode-derived seed. The instructor creates a named assignment which generates a random passcode. That passcode is stored in the instructor's browser localStorage and seeds the hash chain. Students receive the starter doc, write their essay, and submit. The instructor loads submissions and their browser automatically applies the stored passcode to verify — no manual passcode entry needed.

The passcode never appears in the submitted document. Without it, an attacker cannot reconstruct the initial hash and cannot produce a valid chain.

## Instructor Workflow

1. Instructor clicks **"Create Assignment"** on the main page
2. A modal prompts for an assignment name (e.g. "ECO2013 Week 4 Essay")
3. App generates a random 32-character hex passcode via `crypto.getRandomValues`
4. App computes `seedHash = sha256(passcode)` and creates a starter `.writeproof.json` with the assignment name as title
5. App stores `{ seedHash, assignmentName, passcode, createdAt }` in instructor's browser localStorage under `writeproof_keys`, keyed by `seedHash`
6. **Mandatory key export**: before the modal closes, the app forces a download of the key backup file — the instructor cannot skip this step
7. Starter doc is saved to disk — instructor distributes to students via LMS, email, etc.
8. Students open the starter doc, write their essay, export and submit
9. Instructor opens `verify.html`, loads one or more submitted docs
10. App looks up each doc's `seedHash` in localStorage, finds the passcode automatically, and verifies — no manual input needed

## Changes Required

### 1. Document Schema

Add two fields to the document:

```json
{
  "version": "2.0",
  "id": "uuid-here",
  "title": "ECO2013 Week 4 Essay",
  "seeded": true,
  "seedHash": "abc123...",
  ...
}
```

- `seeded`: boolean, indicates this document uses passcode seeding
- `seedHash`: `sha256(passcode)` — safe to store in the doc, one-way hash, does not reveal the passcode
- The passcode itself is **never stored in the document**

**Note:** All students in one assignment share the same `seedHash`. This means a student can confirm which assignment a document belongs to by comparing seedHashes. This is not a security risk — the seedHash does not reveal the passcode — but it is worth being aware of.

### 2. "Create Assignment" Flow (`editor.js` or a new `instructor.js`)

- Add a **"Create Assignment"** button to the main UI, visually distinct from the regular "New" document button so instructors don't accidentally create unseeded docs for graded assignments
- On click, show a modal asking for assignment name
- On confirm:
  - Generate passcode: `crypto.getRandomValues(new Uint8Array(16))` → hex string
  - Compute `seedHash = await generateContentHash(passcode)`
  - Build starter doc JSON with `seeded: true`, `seedHash`, and the assignment name as `title`
  - Save to instructor's localStorage, **keyed by `seedHash`** (not doc ID — see rationale below):
    ```js
    const keys = JSON.parse(localStorage.getItem('writeproof_keys') || '{}');
    keys[seedHash] = { assignmentName, passcode, createdAt: new Date().toISOString() };
    localStorage.setItem('writeproof_keys', JSON.stringify(keys));
    ```
  - **Force download of key backup file** before allowing the modal to close — this is mandatory, not optional
  - Trigger download of starter `.writeproof.json`

#### Why key by `seedHash` instead of `doc.id`

The document `id` is plaintext in the submitted JSON — a student can trivially change it. If the instructor's key store is indexed by `doc.id`, a tampered ID causes silent lookup failure. Using `seedHash` as the key avoids this: the seedHash is a one-way hash that the student cannot forge without the passcode, and it's already present in the document for lookup.

### 3. Hash Chain (`hash-worker.js`)

Change the initial `prevHash` based on whether the doc is seeded:

```js
// In verify handler:
let prevHash = (keystrokeLog.length > 0 && seedHash) ? seedHash : '0';

// Pass seedHash into the worker message from verify-main.js
```

For `hashBatch`, the caller already passes `prevHash` — no change needed there, but the first batch must use `seedHash` instead of `'0'` when creating a seeded doc.

### 4. Verification (`verify.html` / `verify-main.js`)

When verifying a submitted doc:

- Check `doc.seeded === true`
- Look up `doc.seedHash` in localStorage `writeproof_keys`
- If found: compute `sha256(passcode)`, compare to `doc.seedHash` as a sanity check, use as initial `prevHash` for chain verification
- If not found: show a key import/entry panel (see below) — this is a **first-class flow**, not a hidden fallback, since instructors commonly verify on a different machine than where they created the assignment
- Proceed with chain verification using the derived initial hash

#### Cross-device verification flow

The "passcode not found" case is expected whenever an instructor grades on a different machine (home vs. office, lab computer, etc.). The UI should treat this as a primary path:

- Offer **"Import key file"** (drag-drop or file picker for the backup exported at creation)
- Offer **"Enter passcode manually"** as a secondary option
- Imported keys should be saved to localStorage so subsequent docs from the same assignment verify automatically

### 5. Instructor Key Management UI

Add a key management panel (could be a modal or a separate `instructor.html`):

- List all stored assignments: name, seedHash (truncated), date created
- Option to export all keys as JSON backup
- Option to export individual assignment keys
- Option to import keys from backup file
- Persistent banner warning about localStorage volatility (see UX Notes below)

### 6. Security Properties

- **Passcode not in doc**: A student reading the submitted JSON cannot find the passcode
- **seedHash in doc**: Safe to store — one-way hash, does not reveal the passcode
- **Attacker needs passcode to spoof**: Without `sha256(passcode)` as the initial hash, a generated chain will fail verification
- **Teacher's localStorage is trusted**: The attack surface is physical access to the teacher's machine, which is outside the threat model
- **Key lookup by seedHash**: Prevents trivial doc ID tampering from breaking verification

## What This Does Not Solve

- **Manual retyping of AI content**: A student who types AI-generated content character by character or uses a real-time AI typing tool — remains undetectable technically, but is impractical at scale
- **Lost browser data without backup**: If an instructor clears browser data and has no key backup, submitted documents cannot be verified — mitigated by mandatory key export at assignment creation
- **Submission sharing**: WriteProof verifies that a human wrote the content — it does not verify *which* human. A student could share their completed file with another student. This is outside scope; WriteProof is an authorship tool, not a proctoring tool. Plagiarism detection remains a separate concern.
- **Passcode leakage**: If a passcode leaks (e.g., student finds it on a shared computer's localStorage), there is no way to rotate it for already-distributed starter docs. Instructors using shared machines should export and then clear their keys, or use a dedicated browser profile.

## Important UX Notes

- **"Create Assignment" must be visually distinct** from the regular "New" document button so instructors don't accidentally create unseeded docs for graded work
- **Mandatory key export at creation**: The app must force a key backup download before the creation modal closes. Do not rely on the instructor remembering to back up later.
- **Prominent persistent warning on the instructor UI**: "WriteProof is a local application. Your assignment keys are stored in this browser on this computer only. They will be lost if you clear your browser cache, use a different browser, or switch computers. Export your keys after creating every assignment and store the backup somewhere safe. Without your keys, submitted documents cannot be verified."
- This warning should appear on first use, on every "Create Assignment" action, and as a persistent banner on any instructor-facing page — not just buried in a settings panel
- **Cross-device key import is a first-class flow**: The verify page key import should be prominent and easy to use (drag-drop + file picker), not a small text input labeled "fallback". Instructors will routinely verify on a different machine.
