// Reusable DOM helpers for WriteProof

let notificationTimer = null;

export function showNotification(message, type = 'info', duration = 3000) {
  // Remove existing notification
  const existing = document.querySelector('.notification');
  if (existing) existing.remove();
  clearTimeout(notificationTimer);

  const el = document.createElement('div');
  el.className = `notification notification-${type}`;
  el.textContent = message;
  el.setAttribute('role', 'alert');
  document.body.appendChild(el);

  notificationTimer = setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity 200ms';
    setTimeout(() => el.remove(), 200);
  }, duration);
}

export function showModal(title, contentEl, options = {}) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');
  backdrop.setAttribute('aria-label', title);

  const modal = document.createElement('div');
  modal.className = 'modal';

  const header = document.createElement('div');
  header.className = 'modal-header';

  const h3 = document.createElement('h3');
  h3.textContent = title;
  header.appendChild(h3);

  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close';
  closeBtn.innerHTML = '&times;';
  closeBtn.setAttribute('aria-label', 'Close');
  header.appendChild(closeBtn);

  modal.appendChild(header);
  modal.appendChild(contentEl);
  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    if (options.onClose) options.onClose();
  };

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });
  document.addEventListener('keydown', function handler(e) {
    if (e.key === 'Escape') {
      close();
      document.removeEventListener('keydown', handler);
    }
  });

  return { close };
}

export function createElement(tag, attrs = {}, children = []) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs)) {
    if (key === 'className') el.className = val;
    else if (key === 'textContent') el.textContent = val;
    else if (key === 'innerHTML') el.innerHTML = val;
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), val);
    else el.setAttribute(key, val);
  }
  for (const child of children) {
    if (typeof child === 'string') el.appendChild(document.createTextNode(child));
    else if (child) el.appendChild(child);
  }
  return el;
}
