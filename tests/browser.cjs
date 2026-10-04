const {chromium} = require('playwright');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const assert = require('node:assert/strict');
(async () => {
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end('<!doctype html><html><meta charset="utf-8"><title>Copy Tab URL · test</title><style>body{margin:0;background:#f5f6f3;color:#213b2e;font:16px -apple-system,sans-serif}main{padding:80px;max-width:620px}small{font-size:11px;letter-spacing:3px;color:#658573}h1{font-size:48px;font-weight:500;letter-spacing:-2px}p{line-height:1.7;color:#617068}</style><main><small>COPY TAB URL</small><h1>A little less friction.</h1><p>The exact address, ready to paste.</p></main></html>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'copy-tab-url-profile-'));
  const extension = path.resolve(__dirname, '../extension');
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {channel: 'chromium', headless: true,
      viewport: {width: 1100, height: 700}, args: ['--enable-unsafe-extension-debugging', `--disable-extensions-except=${extension}`, `--load-extension=${extension}`]});
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const page = await context.newPage();
    const url = `http://127.0.0.1:${server.address().port}/path?q=a%20b&utm_source=keep#exact-fragment`;
    await page.goto(url); await page.bringToFront();
    console.log('Browser:', context.browser().version());
    console.log('Actual commands API:', JSON.stringify(await worker.evaluate(() => chrome.commands.getAll())));
    const id = await worker.evaluate(() => chrome.runtime.id);
    const shortcuts = await context.newPage();
    await shortcuts.goto('chrome://extensions/shortcuts');
    const shortcutInput = shortcuts.getByRole('textbox', {name:'Shortcut Copy current tab URL for Copy Tab URL'});
    await shortcuts.getByRole('button', {name:'Edit shortcut Copy current tab URL for Copy Tab URL',exact:true}).click();
    await shortcutInput.press('Meta+Shift+C');
    await shortcuts.waitForTimeout(150);
    console.log('After manual assignment:', JSON.stringify(await worker.evaluate(() => chrome.commands.getAll())));
    await shortcuts.close();
    await page.bringToFront();

    // Record copy payload privately in this test context; never part of the shipped extension.
    await worker.evaluate(() => {globalThis.testEvents = []; const original = copyTab; copyTab = async tab => {testEvents.push(tab); return original(tab);};});
    await page.keyboard.press('Meta+Shift+C');
    await page.waitForTimeout(300);
    console.log('Native command via CDP events:', await worker.evaluate(() => testEvents.length));
    // Obtain a genuine user gesture via Chrome's toolbar action, through the test-only CDP API.
    const session = await context.browser().newBrowserCDPSession();
    const pageSession = await context.newCDPSession(page);
    const {targetInfos} = await session.send('Target.getTargets', {filter:[{type:'tab',exclude:false}]});
    const targetInfo = targetInfos.find(t => t.type === 'tab' && t.url === url) || targetInfos.find(t => t.type === 'tab');
    try { await session.send('Extensions.triggerAction', {id, targetId: targetInfo.targetId}); console.log('CDP action available'); }
    catch (e) { console.log('CDP action unavailable:', e.message.split('\n')[0]); }
    await page.waitForTimeout(300);
    await worker.evaluate(() => queue);
    await context.grantPermissions(['clipboard-read'], {origin: new URL(url).origin});
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
    console.log('Actual offscreen clipboard exact URL: PASS');
    assert.equal(await page.locator('html > div').count(), 1);
    await page.screenshot({path: path.resolve(__dirname, '../assets/toast-preview.png')});
    console.log('Actual injected page toast: PASS');
    const restricted = await context.newPage();
    await restricted.goto('chrome://extensions/');
    const {targetInfos: restrictedTargets} = await session.send('Target.getTargets', {filter:[{type:'tab',exclude:false}]});
    const restrictedTarget = restrictedTargets.find(t => t.url === 'chrome://extensions/');
    await session.send('Extensions.triggerAction', {id, targetId:restrictedTarget.targetId});
    await restricted.waitForTimeout(300);
    await worker.evaluate(() => queue);
    const restrictedResult = await worker.evaluate(async () => {const [tab] = await chrome.tabs.query({active:true,lastFocusedWindow:true}); return {title:await chrome.action.getTitle({tabId:tab.id}),badge:await chrome.action.getBadgeText({tabId:tab.id})};});
    console.log('Actual chrome://extensions toolbar result:', JSON.stringify(restrictedResult));
    assert.equal(restrictedResult.title, 'Couldn’t copy URL');
    assert.equal(restrictedResult.badge, '!');
    assert.equal(await page.evaluate(() => navigator.clipboard.readText()), url);
    console.log('Restricted URL withheld: honest failure, prior clipboard preserved: PASS');
    await restricted.close();
    // Browser rendering uses the shipped toast in an isolated extension page, with only test stubs.
    const visual = await context.newPage();
    await visual.goto(`chrome-extension://${id}/offscreen.html`);
    await visual.evaluate(() => {
      document.body.innerHTML = '<main><small>COPY TAB URL</small><h1>A little less friction.</h1><p>The exact address, ready to paste.</p></main>';
      document.head.insertAdjacentHTML('beforeend', '<style>body{margin:0;background:#f5f6f3;color:#213b2e;font:16px -apple-system,sans-serif}main{padding:80px;max-width:620px}small{font-size:11px;letter-spacing:3px;color:#658573}h1{font-size:48px;font-weight:500;letter-spacing:-2px}p{line-height:1.7;color:#617068}</style>');
      const nativeAttach = Element.prototype.attachShadow;
      Element.prototype.attachShadow = function(options) { const root = nativeAttach.call(this, options); globalThis.testRoot = root; return root; };
      globalThis.chrome = {runtime: {id: 'test', onMessage: {addListener(fn) {globalThis.testListener = fn;}}}};
    });
    await visual.addScriptTag({url: `chrome-extension://${id}/toast.js`});
    await visual.evaluate(() => testListener({target:'toast',message:'URL copied',success:true,url:location.href}, {id:'test'}));
    assert.equal(await visual.evaluate(() => testRoot.querySelector('[role=status]').textContent), '✓URL copied');

    await visual.evaluate(() => testListener({target:'toast',message:'URL copied',success:true,url:location.href}, {id:'test'}));
    assert.equal(await visual.evaluate(() => document.querySelectorAll('div').length), 1);
    await visual.waitForTimeout(2300);
    assert.equal(await visual.evaluate(() => document.querySelectorAll('div').length), 0);
    console.log('Shipped toast browser rendering, duplicate/reset and cleanup: PASS');
  } finally { await context?.close(); server.close(); }
})().catch(e => {console.error(e); process.exitCode = 1;});
