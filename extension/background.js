// Snapshot each user invocation before queueing: never copy whichever tab is active later.
let queue = Promise.resolve();
const badgeTimers = new Map();
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'copy-url') invoke(tab);
});
chrome.action.onClicked.addListener(invoke);
function invoke(tab) {
  const snapshot = tab?.id !== undefined ? Promise.resolve({...tab}) :
    chrome.tabs.query({active: true, lastFocusedWindow: true}).then(tabs => tabs[0]);
  queue = queue.then(() => snapshot).then(copyTab).catch(() => {});
}
async function copyTab(tab) {
  if (!tab || tab.id === undefined) return;
  let success = false;
  try {
    if (typeof tab.url !== 'string' || !tab.url) throw new Error('URL unavailable');
    const contexts = await chrome.runtime.getContexts({contextTypes: ['OFFSCREEN_DOCUMENT']});
    if (!contexts.length) await chrome.offscreen.createDocument({
      url: 'offscreen.html', reasons: ['CLIPBOARD'],
      justification: 'Copy the exact URL only after a user shortcut or toolbar click.'
    });
    const result = await chrome.runtime.sendMessage({target: 'clipboard', url: tab.url});
    if (!result?.ok) throw new Error('Clipboard write failed');
    success = true;
  } catch (_) {
    // Never claim success when URL access or the clipboard write failed.
  } finally {
    try { await chrome.offscreen.closeDocument(); } catch (_) {}
  }
  const message = success ? 'URL copied' : 'Couldn’t copy URL';
  await showBadge(tab.id, success, message);
  // Restricted schemes cannot host content scripts. PDF/Web Store injection may also reject.
  if (!/^https?:\/\//i.test(tab.url || '')) return;
  try {
    const current = await chrome.tabs.get(tab.id);
    if (!current.active || current.url !== tab.url) return;
    await chrome.scripting.executeScript({target: {tabId: tab.id}, files: ['toast.js']});
    await chrome.tabs.sendMessage(tab.id, {target: 'toast', message, success, url: tab.url}, {frameId: 0});
  } catch (_) { /* Toolbar badge/title remain the honest confirmation. */ }
}
async function showBadge(tabId, success, message) {
  clearTimeout(badgeTimers.get(tabId));
  try {
    await chrome.action.setBadgeBackgroundColor({tabId, color: success ? '#245c45' : '#9b3940'});
    await chrome.action.setTitle({tabId, title: message});
    await chrome.action.setBadgeText({tabId, text: success ? '✓' : '!'});
    badgeTimers.set(tabId, setTimeout(() => {
      badgeTimers.delete(tabId);
      chrome.action.setBadgeText({tabId, text: ''}).catch(() => {});
      chrome.action.setTitle({tabId, title: 'Copy current tab URL'}).catch(() => {});
    }, 2400));
  } catch (_) {}
}
