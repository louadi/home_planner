// Getting the shopping list off the device.
//
// The tablet stays at home while somebody else is at the shop, so the list has to be
// able to travel. Email is the primary route because a `mailto:` link works the same on
// Android and on a desktop, with no account setup and no server involved.
//
// Two things a mail client cannot promise us:
//   - Whether one exists at all. A desktop with only webmail will do nothing when a
//     mailto: link is opened, and the browser gives us no way to detect that. So every
//     email action is followed by an offer to copy the list instead.
//   - Unlimited length. Mail clients and the OS truncate long URLs, so the body is
//     capped and the user is told when that happens rather than silently losing items.

import { openSheet, toast, el } from './dom.js';

// Kept well under the ~2000 character ceiling that mail clients start trimming at.
const MAILTO_MAX = 1600;

function dateLabel(d = new Date()) {
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

const clean = (item) => String(item?.text ?? '').trim();

/** Plain text of the list: things still to buy, optionally what is already in the basket. */
export function shoppingListText(state, { includeBought = false } = {}) {
  const items = Array.isArray(state?.groceries) ? state.groceries : [];
  const toBuy = items.filter((g) => !g.checked && clean(g));
  const bought = items.filter((g) => g.checked && clean(g));

  const lines = [];
  if (toBuy.length) toBuy.forEach((g) => lines.push(`- ${clean(g)}`));
  else lines.push('Nothing left to buy.');

  if (includeBought && bought.length) {
    lines.push('', 'Already in the basket:');
    bought.forEach((g) => lines.push(`- ${clean(g)}`));
  }
  return lines.join('\n');
}

export function shoppingListSubject(state, date = new Date()) {
  const count = (state?.groceries || []).filter((g) => !g.checked && clean(g)).length;
  return `Shopping list (${count} item${count === 1 ? '' : 's'}) — ${dateLabel(date)}`;
}

/**
 * Build a mailto: URL, trimming the body if the result would be too long for a mail
 * client to accept. Returns the url plus whether anything had to be dropped.
 */
export function buildMailto(to, subject, body, limit = MAILTO_MAX) {
  const address = typeof to === 'string' ? to.trim() : '';
  const make = (text) => `mailto:${address}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;

  let url = make(body);
  if (url.length <= limit) return { url, truncated: false };

  const notice = '\n\n(list shortened to fit — copy it instead for the full list)';
  const lines = body.split('\n');
  let kept = lines;
  while (kept.length > 1 && make(kept.join('\n') + notice).length > limit) kept = kept.slice(0, -1);
  return { url: make(kept.join('\n') + notice), truncated: true };
}

/** Copy text, falling back to a hidden textarea where the async clipboard is unavailable. */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

function openUrl(url, newTab = false) {
  const a = document.createElement('a');
  a.href = url;
  if (newTab) {
    a.target = '_blank';
    a.rel = 'noopener';
  }
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** Gmail's web composer: the way out when a desktop has no mail client configured. */
function gmailComposeUrl(to, subject, body) {
  const params = new URLSearchParams({ view: 'cm', fs: '1', su: subject, body });
  if (to) params.set('to', to);
  return `https://mail.google.com/mail/?${params.toString()}`;
}

async function copyWithFeedback(text) {
  const ok = await copyText(text);
  if (ok) {
    toast('List copied — paste it anywhere');
    return;
  }
  // Some browsers refuse clipboard access outright. Rather than leaving a dead end,
  // put the text on screen, selected, so it can be copied by hand.
  showListForManualCopy(text);
}

/** Last resort: the list in a selectable box, pre-selected for a manual copy. */
export function showListForManualCopy(text) {
  const box = el('textarea', {
    class: 'share-text',
    readonly: '',
    rows: String(Math.min(14, Math.max(4, text.split('\n').length + 1))),
    'aria-label': 'Shopping list text',
  });
  box.value = text;

  openSheet({
    title: 'Copy the list',
    subtitle: 'This browser blocked copying, so here it is to copy by hand',
    content: [box],
    options: [
      {
        label: 'Select all',
        icon: 'edit',
        keepOpen: true,
        onClick: () => {
          box.focus();
          box.select();
        },
      },
    ],
  });

  // Give it a moment to be in the document before selecting, or focus is lost.
  setTimeout(() => {
    box.focus();
    box.select();
  }, 120);
}

/** The sheet offering every way of sending the list. */
export function openShareList(state) {
  const body = shoppingListText(state);
  const subject = shoppingListSubject(state);
  const to = (state.settings?.shareEmail || '').trim();
  const count = (state.groceries || []).filter((g) => !g.checked && clean(g)).length;
  const canShare = typeof navigator.share === 'function';

  const sendEmail = () => {
    const { url, truncated } = buildMailto(to, subject, body);
    openUrl(url);
    // We cannot tell whether a mail client actually opened, so always leave a way out.
    toast(truncated ? 'List shortened to fit the email' : 'Opening your email app…', {
      label: 'Copy instead',
      onClick: () => copyWithFeedback(body),
    });
  };

  openSheet({
    title: 'Send the shopping list',
    subtitle: count ? `${count} item${count === 1 ? '' : 's'} still to buy` : 'Nothing left to buy',
    options: [
      {
        label: to ? `Email it to ${to}` : 'Email the list',
        icon: 'note',
        hint: to ? 'Opens your email app, already addressed' : 'Opens your email app with the list filled in',
        onClick: sendEmail,
      },
      {
        label: 'Open in Gmail',
        icon: 'upload',
        hint: 'Use this if no email app is set up on this device',
        onClick: () => openUrl(gmailComposeUrl(to, subject, body), true),
      },
      canShare
        ? {
            label: 'Send to another app',
            icon: 'users',
            hint: 'WhatsApp, Messages, Keep — whatever is installed',
            onClick: async () => {
              try {
                await navigator.share({ title: subject, text: body });
              } catch {
                /* the user dismissed the share sheet */
              }
            },
          }
        : null,
      {
        label: 'Copy to clipboard',
        icon: 'edit',
        hint: 'Paste it into any message yourself',
        onClick: () => copyWithFeedback(body),
      },
    ],
  });
}
