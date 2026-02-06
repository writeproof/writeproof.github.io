# WriteProof

**Prove Your Work Is Yours**

Browser-based word processor with cryptographic proof of authorship. Records keystrokes and writing patterns while running 100% in the browser.

## What It Does

WriteProof records every keystroke with microsecond-precision timestamps and builds a cryptographic hash chain to create tamper-proof verification of your writing process. Anyone can replay your session and verify authenticity.

- Distraction-free editor with real-time word/character counts
- Keystroke recording with SHA-256 hash chain
- Writing session replay at configurable speeds
- Authenticity score based on behavioral analysis
- Share via URL or export as JSON
- Link support for citing sources (Ctrl+K)
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
| `docs.html` | Documentation |
| `about.html` | About the project |
| `privacy.html` | Privacy policy |

## Project Structure

```
/src
  /core
    editor.js        -- Editor lifecycle and document management
    keystroke.js     -- Keystroke recording and classification
    hashing.js       -- SHA-256 hash generation and verification
    storage.js       -- localStorage persistence
  /features
    replay.js        -- Replay engine with playback controls
    analytics.js     -- Authenticity score calculation
    export.js        -- Export, import, and URL sharing
  /ui
    components.js    -- Notifications, modals
    views.js         -- Document list, score display
  /utils
    helpers.js       -- Formatting, UUID generation
    caret.js         -- Contenteditable DOM-to-text bridge
  /vendor
    lz-string.min.js -- Compression for URL sharing
  main.js            -- Editor entry point
  verify-main.js     -- Verify page entry point
/assets
  styles.css         -- Design system and all styles
  logo.svg           -- Logo
```

## Authenticity Score

The score (0--100) evaluates how human-like the writing pattern is:

| Metric | Points | What It Measures |
|--------|--------|------------------|
| Non-linearity | 0--30 | Cursor jumps, out-of-order edits |
| Revision intensity | 0--25 | Deletion/rewriting frequency |
| Pause variability | 0--25 | Variation in typing rhythm |
| Paste analysis | 0--20 | Penalty for large paste operations |

## Privacy

Everything runs in your browser. No servers, no database, no backend. Your data lives in localStorage and exported files -- nowhere else. [Read more](https://writeproof.github.io/writeproof/privacy.html).

## License

Open source (MIT). Built by Franklin R. Castillo.
