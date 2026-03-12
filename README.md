# WriteProof

**Prove Your Work Is Yours**

Browser-based word processor with cryptographic proof of authorship. Records keystrokes and writing patterns while running 100% in the browser.

## What It Does

WriteProof records every keystroke with microsecond-precision timestamps and builds a cryptographic hash chain to create tamper-proof verification of your writing process. Anyone can replay your session and verify authenticity.

- Distraction-free editor with real-time word/character counts
- Keystroke recording with SHA-256 hash chain
- Writing session replay at configurable speeds
- Writing profile based on behavioral analysis
- Multi-document comparison via scatter plots
- Share via URL or export as JSON
- Link support for citing sources (Ctrl+K)
- Multi-tab conflict detection
- 100% client-side -- no servers, no accounts, no data collection

## Getting Started

Open [writeproof.github.io/writeproof](https://writeproof.github.io/writeproof/) and start writing. No setup required.

To run locally:

```
git clone https://github.com/writeproof/writeproof.git
cd writeproof.github.io
python3 -m http.server 8000
# Open http://localhost:8000
```

## How It Works

1. **Write** -- Use the editor naturally. Every keystroke is recorded with precise timestamps.
2. **Verify** -- Cryptographic hashes create an immutable chain. Tampering breaks the chain.
3. **Share** -- Export a `.writeproof.json` file or copy a share link. Recipients can replay and verify.

## Pages

| Page | Description |
|------|-------------|
| `index.html` | Main editor |
| `verify.html` | Replay and verify documents |
| `compare.html` | Multi-document scatter plot comparison |
| `docs.html` | Documentation |
| `about.html` | About the project |
| `privacy.html` | Privacy policy |

## Project Structure

```
/src
  /core
    editor.js        -- Editor lifecycle and document management
    keystroke.js     -- Keystroke recording and classification
    hashing.js       -- SHA-256 hash generation, verification, and checkpoints
    storage.js       -- localStorage persistence
  /features
    replay.js        -- Replay engine with playback controls
    analytics.js     -- Writing profile calculation
    dimensions.js    -- Scatter plot dimension computation
    export.js        -- Export, import, and URL sharing
  /ui
    components.js    -- Notifications, modals
    views.js         -- Document list, profile display
    chart.js         -- Canvas-based scatter plot renderer
    link-dialog.js   -- Link popup and dialog management
    welcome.js       -- First-visit welcome panel
  /utils
    helpers.js       -- Formatting, UUID generation, error boundaries
    caret.js         -- Contenteditable DOM-to-text bridge
  /workers
    hash-worker.js   -- Web Worker for off-thread hash computation
  /vendor
    lz-string.min.js -- Compression for URL sharing
  main.js            -- Editor entry point
  verify-main.js     -- Verify page entry point
  compare-main.js    -- Compare page entry point
/assets
  styles.css         -- Design system and all styles
  logo.svg           -- Logo
```

## Writing Profile

The writing profile analyzes behavioral patterns to assess authenticity:

| Metric | What It Measures |
|--------|------------------|
| Composition | Keystroke counts, insertions, deletions, pastes |
| Pasting behavior | Paste frequency, pasted content percentage, largest paste |
| Editing patterns | Deletion ratio, edit locality (near vs. far edits) |
| Timing | Median interval, longest pause, pause frequency |

## Architecture Highlights

- **Text-diff keystroke recording** -- Compares before/after text instead of relying on `inputType`, making it robust against autocorrect, spellcheck, IME, and undo/redo.
- **Async hash queue** -- SHA-256 hashing runs asynchronously to avoid blocking the UI. Save waits for the queue to stabilize before persisting.
- **Web Worker verification** -- Hash chain verification runs in a dedicated Web Worker to keep the main thread responsive for large documents. Falls back to main-thread computation if workers are unavailable.
- **Incremental checkpoints** -- Content and hash state are checkpointed every 1000 events, allowing verification to resume from the nearest checkpoint instead of replaying from the beginning.
- **Error boundaries** -- All event handlers are wrapped to prevent a single error from crashing the editor.

## Privacy

Everything runs in your browser. No servers, no database, no backend. Your data lives in localStorage and exported files -- nowhere else. [Read more](https://writeproof.github.io/writeproof/privacy.html).

## License

Open source (MIT). Built by Franklin R. Castillo.
