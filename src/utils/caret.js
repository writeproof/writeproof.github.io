// DOM-to-text bridge utilities for contenteditable editor

/**
 * Walk DOM and extract plain text.
 * Text nodes → their text, <br> → \n, <a> → recurse for text,
 * <div>/<p> (not first child) → prepend \n then recurse.
 */
export function getTextContent(el) {
  let text = '';
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === Node.TEXT_NODE) {
      text += node.textContent;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === 'BR') {
        text += '\n';
      } else if (tag === 'A') {
        text += getTextContent(node);
      } else if (tag === 'DIV' || tag === 'P') {
        if (i > 0) text += '\n';
        text += getTextContent(node);
      } else {
        text += getTextContent(node);
      }
    }
  }
  return text;
}

/**
 * Extract plain text and link positions from contenteditable element.
 * Returns { text, links } where links = [{ start, end, url }, ...]
 */
export function extractContentAndLinks(el) {
  const links = [];
  let offset = 0;

  function walk(parent, childIndex) {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const node = parent.childNodes[i];
      if (node.nodeType === Node.TEXT_NODE) {
        offset += node.textContent.length;
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const tag = node.tagName;
        if (tag === 'BR') {
          offset += 1; // \n
        } else if (tag === 'A') {
          const start = offset;
          walk(node, 0);
          const end = offset;
          const url = node.getAttribute('href') || '';
          if (url) {
            links.push({ start, end, url });
          }
        } else if (tag === 'DIV' || tag === 'P') {
          // Non-first block-level children get a preceding newline
          const parentChildIndex = Array.prototype.indexOf.call(parent.childNodes, node);
          if (parentChildIndex > 0) {
            offset += 1; // \n
          }
          walk(node, 0);
        } else {
          walk(node, 0);
        }
      }
    }
  }

  walk(el, 0);
  const text = getTextContent(el);
  return { text, links };
}

/**
 * Render text + links into a contenteditable element.
 * Text nodes for plain text (splitting on \n → <br>),
 * <a contenteditable="false" class="editor-link"> for link ranges.
 */
export function renderContentWithLinks(el, text, links) {
  el.innerHTML = '';
  if (!text && (!links || links.length === 0)) return;

  // Sort links by start position
  const sorted = (links || []).slice().sort((a, b) => a.start - b.start);

  let pos = 0;
  for (const link of sorted) {
    // Insert plain text before this link
    if (link.start > pos) {
      appendTextWithBreaks(el, text.slice(pos, link.start));
    }
    // Insert link element
    const a = document.createElement('a');
    a.href = link.url;
    a.className = 'editor-link';
    a.contentEditable = 'false';
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = text.slice(link.start, link.end);
    el.appendChild(a);
    pos = link.end;
  }

  // Insert remaining text after last link
  if (pos < text.length) {
    appendTextWithBreaks(el, text.slice(pos));
  }
}

/**
 * Append text to element, converting \n to <br>.
 */
function appendTextWithBreaks(el, text) {
  const parts = text.split('\n');
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) {
      el.appendChild(document.createElement('br'));
    }
    if (parts[i].length > 0) {
      el.appendChild(document.createTextNode(parts[i]));
    }
  }
}

/**
 * Get selection start/end as plain-text offsets within a contenteditable element.
 */
export function getSelectionOffsets(el) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) {
    return { start: 0, end: 0 };
  }
  const range = sel.getRangeAt(0);

  const startOffset = domOffsetToText(el, range.startContainer, range.startOffset);
  const endOffset = range.collapsed ? startOffset : domOffsetToText(el, range.endContainer, range.endOffset);

  return { start: startOffset, end: endOffset };
}

/**
 * Shorthand: get caret position as plain-text offset.
 */
export function getCaretOffset(el) {
  return getSelectionOffsets(el).start;
}

/**
 * Set caret to a specific plain-text offset within a contenteditable element.
 */
export function setCaretOffset(el, offset) {
  const pos = textOffsetToDom(el, offset);
  if (!pos) return;
  const sel = window.getSelection();
  const range = document.createRange();
  range.setStart(pos.node, pos.offset);
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Convert a DOM position (container + offset) to a plain-text offset.
 */
function domOffsetToText(root, container, offset) {
  let textOffset = 0;
  let found = false;

  function walk(node) {
    if (found) return;

    if (node === container) {
      if (node.nodeType === Node.TEXT_NODE) {
        textOffset += offset;
        found = true;
        return;
      }
      // Element node: count children up to offset
      for (let i = 0; i < offset && i < node.childNodes.length; i++) {
        walk(node.childNodes[i]);
        if (found) return;
      }
      found = true;
      return;
    }

    if (node.nodeType === Node.TEXT_NODE) {
      textOffset += node.textContent.length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === 'BR') {
        textOffset += 1;
      } else if (tag === 'DIV' || tag === 'P') {
        // Non-first block children get a preceding newline
        const parent = node.parentNode;
        if (parent) {
          const idx = Array.prototype.indexOf.call(parent.childNodes, node);
          if (idx > 0) textOffset += 1;
        }
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (found) return;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (found) return;
        }
      }
    }
  }

  for (let i = 0; i < root.childNodes.length; i++) {
    walk(root.childNodes[i]);
    if (found) break;
  }

  return textOffset;
}

/**
 * Convert a plain-text offset to a DOM position { node, offset }.
 */
function textOffsetToDom(root, targetOffset) {
  let remaining = targetOffset;
  let result = null;

  function walk(node) {
    if (result) return;

    if (node.nodeType === Node.TEXT_NODE) {
      if (remaining <= node.textContent.length) {
        result = { node, offset: remaining };
        return;
      }
      remaining -= node.textContent.length;
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName;
      if (tag === 'BR') {
        if (remaining === 0) {
          // Position before the <br>
          const parent = node.parentNode;
          const idx = Array.prototype.indexOf.call(parent.childNodes, node);
          result = { node: parent, offset: idx };
          return;
        }
        remaining -= 1;
      } else if (tag === 'DIV' || tag === 'P') {
        const parent = node.parentNode;
        if (parent) {
          const idx = Array.prototype.indexOf.call(parent.childNodes, node);
          if (idx > 0) {
            if (remaining === 0) {
              result = { node: parent, offset: idx };
              return;
            }
            remaining -= 1;
          }
        }
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (result) return;
        }
      } else {
        for (let i = 0; i < node.childNodes.length; i++) {
          walk(node.childNodes[i]);
          if (result) return;
        }
      }
    }
  }

  for (let i = 0; i < root.childNodes.length; i++) {
    walk(root.childNodes[i]);
    if (result) return result;
  }

  // If offset is at the very end, place caret at end of root
  return { node: root, offset: root.childNodes.length };
}
