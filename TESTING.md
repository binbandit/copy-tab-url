# Verification evidence

Tested with Node's test runner, jsdom 30.1.2 and Playwright 1.63.0, using Chrome for Testing 153.0.8010.12 (Mac arm64) in a fresh temporary headless profile. No user browser profile or native desktop UI was used.

## Automated behavioral tests

Six tests cover:

- Exact Chrome tab URL, query, percent encoding, tracking parameters and hash; the invocation snapshot survives tab changes.
- Unrelated commands cause no clipboard write; copy failure yields a failure badge and never a success confirmation.
- Scheme constraints, unavailable URL and blocked injection.
- Offscreen extension-sender filtering, checked copy return value, exact string and temporary-text cleanup.
- One toast/listener, shadow-root isolation, polite status, duplicate timeout reset, reduced motion, changed success/failure mark and timeout/pagehide cleanup.
- Manifest V3, the Mac-only requested suggested shortcut and absence of persistent site permissions.

## Real browser checks

- The unpacked MV3 extension loaded and its worker ran.
- `chrome.commands.getAll()` initially returned an empty shortcut for `copy-url`: the requested native shortcut was not automatically assigned.
- In the isolated `chrome://extensions/shortcuts` editor, clicking Edit and entering Cmd+Shift+C registered `⇧⌘C` through the actual commands API.
- Sending synthetic Cmd+Shift+C using headless CDP input produced no command event. This does **not** establish physical keyboard behavior. Native Inspect conflict/physical dispatch still requires the user's manual check.
- Chrome's test-only `Extensions.triggerAction` invoked the real toolbar action with a genuine activeTab grant.
- The actual offscreen clipboard write was read back in the test browser and exactly equaled a synthetic HTTP URL containing `?q=a%20b&utm_source=keep#exact-fragment`.
- The actual HTTP page toast was injected; `assets/toast-preview.png` captures that extension result on the local fixture.
- On `chrome://extensions/`, Chrome withheld the URL: the real action displayed **Couldn’t copy URL**, showed `!`, and left the previous clipboard unchanged. This is an intentional permission boundary, not a successful internal-page copy.
- The shipped toast also rendered in an isolated extension-page fixture; repeated messages produced one host and timeout removed it.

## Remaining manual checks

Physical Cmd+Shift+C dispatch on stable personal/work Mac Chrome; Web Store/PDF behavior across Chrome versions; screen-reader announcements; enterprise installation policy. Web Store/PDF injection rejection is covered by mocked behavior, but was not end-to-end tested. No security or policy bypass is attempted.

No GitHub, Library or test credentials are part of the extension or release ZIP. No runtime dependencies or network calls.
