const {test} = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const {JSDOM} = require('jsdom');
const source = name => fs.readFileSync(`${__dirname}/../extension/${name}`, 'utf8');
function background({ok = true, url = 'https://example.com/path?q=a%20b&utm_source=x#frag', blocked = false} = {}) {
  let command, click, copied, injected = 0, closed = 0;
  const badge = [], timers = [];
  const tab = {id: 7, url, active: true};
  const chrome = {
    commands: {onCommand: {addListener: fn => command = fn}},
    action: {onClicked: {addListener: fn => click = fn},
      setBadgeText: async x => badge.push(x.text), setTitle: async () => {}, setBadgeBackgroundColor: async () => {}},
    tabs: {query: async () => [{...tab}], get: async () => ({...tab}), sendMessage: async () => {}},
    runtime: {getContexts: async () => [], sendMessage: async x => {copied = x.url; return {ok};}},
    offscreen: {createDocument: async () => {}, closeDocument: async () => closed++},
    scripting: {executeScript: async () => {injected++; if (blocked) throw Error('Restricted');}}
  };
  const context = vm.createContext({chrome, setTimeout: fn => {timers.push(fn); return timers.length;}, clearTimeout() {}});
  vm.runInContext(source('background.js'), context);
  return {command: (...args) => command(...args), click: (...args) => click(...args), tab,
    drain: () => vm.runInContext('queue', context), results: () => ({copied, injected, closed, badge, timers})};
}
test('exact event-tab URL, query/hash preserved; switch does not change snapshot', async () => {
  const env = background(); const exact = env.tab.url;
  env.command('copy-url', env.tab); env.tab.url = 'https://other.test/';
  await env.drain(); assert.equal(env.results().copied, exact); assert.equal(env.results().injected, 0);
});
test('only requested command copies; clipboard failure never announces success', async () => {
  const env = background({ok: false}); env.command('other', env.tab); await env.drain();
  assert.equal(env.results().copied, undefined);
  env.click(env.tab); await env.drain(); assert.deepEqual(env.results().badge, ['!']); assert.equal(env.results().closed, 1);
});
test('restricted schemes and missing URL fail safely; HTTP injection rejection retains badge', async () => {
  for (const url of ['chrome://extensions/', 'file:///tmp/a.pdf', 'data:text/plain,hello']) {
    const env = background({url}); env.click(env.tab); await env.drain();
    assert.equal(env.results().copied, url); assert.equal(env.results().injected, 0);
  }
  const missing = background({url: ''}); missing.click(missing.tab); await missing.drain();
  assert.equal(missing.results().copied, undefined); assert.deepEqual(missing.results().badge, ['!']);
  const blocked = background({blocked: true}); blocked.click(blocked.tab); await blocked.drain();
  assert.deepEqual(blocked.results().badge, ['✓']);
});
test('offscreen write requires extension sender, exact string, and positive copy result', () => {
  for (const ok of [true, false]) {
    let listener, selected = '', result;
    const textarea = {value: '', select() { selected = this.value; }};
    vm.runInNewContext(source('offscreen.js'), {chrome: {runtime: {id: 'ours', onMessage: {addListener: fn => listener = fn}}},
      document: {getElementById: () => textarea, execCommand: () => ok}});
    listener({target: 'clipboard', url: 'https://x.test/?x=1#hash'}, {id: 'foreign'}, x => result = x);
    assert.equal(result, undefined);
    listener({target: 'clipboard', url: 'https://x.test/?x=1#hash'}, {id: 'ours'}, x => result = x);
    assert.equal(result.ok, ok); assert.equal(selected, 'https://x.test/?x=1#hash'); assert.equal(textarea.value, '');
  }
});
test('toast has one listener/host, shadow isolation, reset timeout, status and cleanup', () => {
  const dom = new JSDOM('<html><body></body></html>', {url: 'https://example.com/?a=1#x', runScripts: 'outside-only'});
  const w = dom.window; let listener, listeners = 0, root; const timers = new Map(); let next = 0;
  const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function(options) { root = attach.call(this, options); return root; };
  w.chrome = {runtime: {id: 'ours', onMessage: {addListener(fn) { listener = fn; listeners++; }}}};
  w.setTimeout = fn => {timers.set(++next, fn); return next;}; w.clearTimeout = id => timers.delete(id);
  w.eval(source('toast.js')); w.eval(source('toast.js')); assert.equal(listeners, 1);
  const message = {target: 'toast', message: 'URL copied', success: true, url: w.location.href};
  listener(message, {id: 'ours'}); listener(message, {id: 'ours'});
  assert.equal(w.document.documentElement.children.length, 3); assert.equal(timers.size, 1);
  assert.equal(root.querySelector('[role=status]').textContent, '✓URL copied');
  assert.match(root.querySelector('style').textContent, /prefers-reduced-motion/);
  listener({...message, success: false, message: 'Couldn’t copy URL'}, {id: 'ours'});
  assert.equal(root.querySelector('.mark').textContent, '!');
  [...timers.values()][0](); assert.equal(w.document.documentElement.children.length, 2);
  listener(message, {id: 'ours'}); w.dispatchEvent(new w.Event('pagehide'));
  assert.equal(w.document.documentElement.children.length, 2); dom.window.close();
});
test('manifest has no persistent site access and a Mac-only suggested shortcut', () => {
  const manifest = JSON.parse(source('manifest.json'));
  assert.equal(manifest.manifest_version, 3); assert.equal(manifest.host_permissions, undefined);
  assert.deepEqual(manifest.permissions, ['activeTab', 'scripting', 'clipboardWrite', 'offscreen']);
  assert.deepEqual(manifest.commands['copy-url'].suggested_key, {mac: 'Command+Shift+C'});
});
