(() => {
  const key = '__copyTabUrlToastV1';
  if (globalThis[key]) return;
  let host, label, mark, timer;
  function remove() { host?.remove(); host = label = undefined; }
  chrome.runtime.onMessage.addListener((message, sender) => {
    if (sender.id !== chrome.runtime.id || message.target !== 'toast' || message.url !== location.href) return;
    clearTimeout(timer);
    if (!host?.isConnected) {
      host = document.createElement('div');
      host.style.cssText = 'all:initial!important;position:fixed!important;right:24px!important;bottom:24px!important;z-index:2147483647!important;pointer-events:none!important;display:block!important;';
      const root = host.attachShadow({mode: 'closed'});
      const style = document.createElement('style');
      style.textContent = `
        .toast{all:initial;box-sizing:border-box;display:flex;align-items:center;gap:10px;padding:14px 18px;border:1px solid #ffffff20;border-radius:14px;background:#18221ff5;color:#f3f7f4;font:500 13px/20px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;letter-spacing:.1px;box-shadow:0 8px 28px #07120b26;animation:arrive 160ms ease-out}
        .mark{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#b8e0c922;color:#b8e0c9;font:600 12px/1 sans-serif}
        @keyframes arrive{from{opacity:0;transform:translateY(5px)}to{opacity:1;transform:translateY(0)}}
        @media(prefers-reduced-motion:reduce){.toast{animation:none}}
      `;
      const toast = document.createElement('div');
      toast.className = 'toast'; toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite'); toast.setAttribute('aria-atomic', 'true');
      mark = document.createElement('span'); mark.className = 'mark';
      mark.setAttribute('aria-hidden', 'true'); mark.textContent = message.success ? '✓' : '!';
      label = document.createElement('span');
      toast.append(mark, label); root.append(style, toast);
      document.documentElement.append(host);
    }
    mark.textContent = message.success ? '✓' : '!';
    label.textContent = message.message;
    timer = setTimeout(remove, 2200);
  });
  addEventListener('pagehide', () => { clearTimeout(timer); remove(); });
  globalThis[key] = true;
})();
