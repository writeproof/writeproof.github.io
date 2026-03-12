// Link dialog and popup management for WriteProof editor

import { getSelectionOffsets } from '../utils/caret.js';

function normalizeUrl(url) {
  url = url.trim();
  if (!url) return '';
  if (/^(javascript|data|vbscript):/i.test(url)) return '';
  if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
    url = 'https://' + url;
  }
  return url;
}

export function initLinkFeature(textarea, editor) {
  const linkPopup = document.getElementById('link-popup');
  const linkPopupOpen = document.getElementById('link-popup-open');
  const linkPopupEdit = document.getElementById('link-popup-edit');
  const linkPopupRemove = document.getElementById('link-popup-remove');
  const linkDialogBackdrop = document.getElementById('link-dialog-backdrop');
  const linkDialogTitle = document.getElementById('link-dialog-title');
  const linkTextGroup = document.getElementById('link-text-group');
  const linkTextInput = document.getElementById('link-text-input');
  const linkUrlInput = document.getElementById('link-url-input');
  const linkDialogSave = document.getElementById('link-dialog-save');
  const linkDialogCancel = document.getElementById('link-dialog-cancel');
  const linkDialogClose = document.getElementById('link-dialog-close');

  let activeLinkEl = null;
  let linkDialogMode = null;
  let savedSelection = null;

  function saveSelection() {
    const sel = window.getSelection();
    if (sel.rangeCount > 0) {
      savedSelection = sel.getRangeAt(0).cloneRange();
    }
  }

  function restoreSelection() {
    if (!savedSelection) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedSelection);
    savedSelection = null;
  }

  function openLinkDialog(mode, existingUrl) {
    linkDialogMode = mode;
    linkTextInput.value = '';
    linkUrlInput.value = existingUrl || '';

    if (mode === 'insert-text') {
      linkTextGroup.style.display = '';
      linkDialogTitle.textContent = 'Insert Link';
      linkDialogSave.textContent = 'Insert';
    } else if (mode === 'insert-selection') {
      linkTextGroup.style.display = 'none';
      linkDialogTitle.textContent = 'Insert Link';
      linkDialogSave.textContent = 'Insert';
    } else if (mode === 'edit') {
      linkTextGroup.style.display = 'none';
      linkDialogTitle.textContent = 'Edit Link';
      linkDialogSave.textContent = 'Save';
    }

    linkDialogBackdrop.style.display = 'flex';
    linkUrlInput.focus();
  }

  function closeLinkDialog() {
    linkDialogBackdrop.style.display = 'none';
    linkTextInput.value = '';
    linkUrlInput.value = '';
    linkDialogMode = null;
    activeLinkEl = null;
  }

  function handleLinkDialogSubmit() {
    const url = normalizeUrl(linkUrlInput.value);
    if (!url) {
      linkUrlInput.focus();
      return;
    }

    if (linkDialogMode === 'edit' && activeLinkEl) {
      editor.editLink(activeLinkEl, url);
      closeLinkDialog();
      return;
    }

    if (linkDialogMode === 'insert-selection') {
      restoreSelection();
      const sel = window.getSelection();
      if (sel.rangeCount > 0 && !sel.isCollapsed) {
        const range = sel.getRangeAt(0);
        const a = document.createElement('a');
        a.href = url;
        a.className = 'editor-link';
        a.contentEditable = 'false';
        a.target = '_blank';
        a.rel = 'noopener';
        try {
          range.surroundContents(a);
        } catch (_) {
          a.textContent = sel.toString();
          range.deleteContents();
          range.insertNode(a);
        }
        sel.removeAllRanges();
        const afterRange = document.createRange();
        afterRange.setStartAfter(a);
        afterRange.collapse(true);
        sel.addRange(afterRange);
      }
      closeLinkDialog();
      return;
    }

    if (linkDialogMode === 'insert-text') {
      const text = linkTextInput.value.trim() || url;
      restoreSelection();
      const a = document.createElement('a');
      a.href = url;
      a.className = 'editor-link';
      a.contentEditable = 'false';
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = text;

      const sel = window.getSelection();
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        range.insertNode(a);
        const afterRange = document.createRange();
        afterRange.setStartAfter(a);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);
      } else {
        textarea.appendChild(a);
      }
      closeLinkDialog();
      return;
    }

    closeLinkDialog();
  }

  // --- Link popup (click on link) ---

  function showLinkPopup(linkEl) {
    activeLinkEl = linkEl;
    const rect = linkEl.getBoundingClientRect();
    linkPopup.style.display = 'flex';
    linkPopup.style.left = `${rect.left + rect.width / 2}px`;
    linkPopup.style.top = `${rect.top - 8}px`;
  }

  function hideLinkPopup() {
    linkPopup.style.display = 'none';
    activeLinkEl = null;
  }

  // --- Event wiring ---

  // Link button
  document.getElementById('btn-link').addEventListener('click', () => {
    textarea.focus();
    saveSelection();
    const offsets = getSelectionOffsets(textarea);
    if (offsets.start !== offsets.end) {
      openLinkDialog('insert-selection');
    } else {
      openLinkDialog('insert-text');
    }
  });

  // Ctrl+K shortcut
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      document.getElementById('btn-link').click();
    }
  });

  linkDialogSave.addEventListener('click', handleLinkDialogSubmit);
  linkDialogCancel.addEventListener('click', closeLinkDialog);
  linkDialogClose.addEventListener('click', closeLinkDialog);

  linkDialogBackdrop.addEventListener('click', (e) => {
    if (e.target === linkDialogBackdrop) closeLinkDialog();
  });

  linkUrlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleLinkDialogSubmit();
    }
  });

  linkTextInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      linkUrlInput.focus();
    }
  });

  textarea.addEventListener('click', (e) => {
    const linkEl = e.target.closest('a.editor-link');
    if (linkEl) {
      e.preventDefault();
      showLinkPopup(linkEl);
    } else {
      hideLinkPopup();
    }
  });

  document.addEventListener('click', (e) => {
    if (linkPopup.style.display === 'none') return;
    if (linkPopup.contains(e.target)) return;
    if (e.target.closest && e.target.closest('a.editor-link')) return;
    hideLinkPopup();
  });

  document.addEventListener('scroll', hideLinkPopup, true);

  linkPopupOpen.addEventListener('click', () => {
    if (activeLinkEl) {
      window.open(activeLinkEl.href, '_blank', 'noopener');
    }
    hideLinkPopup();
  });

  linkPopupEdit.addEventListener('click', () => {
    if (activeLinkEl) {
      const url = activeLinkEl.getAttribute('href') || '';
      openLinkDialog('edit', url);
    }
    hideLinkPopup();
  });

  linkPopupRemove.addEventListener('click', () => {
    if (activeLinkEl) {
      editor.removeLink(activeLinkEl);
    }
    hideLinkPopup();
  });
}
