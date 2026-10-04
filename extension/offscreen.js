chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id || message.target !== 'clipboard') return;
  const textarea = document.getElementById('clipboard');
  try {
    if (typeof message.url !== 'string' || !message.url) throw new Error('Missing URL');
    // Offscreen documents cannot be focused; Chrome's official offscreen sample uses
    // execCommand here. Check its boolean return, then discard the temporary value.
    textarea.value = message.url;
    textarea.select();
    const ok = document.execCommand('copy');
    respond({ok: ok === true});
  } catch (_) { respond({ok: false}); }
  finally { textarea.value = ''; }
});
