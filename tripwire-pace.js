/*!
 * tripwire-pace.js
 * Part of the Tripwire suite — human-speed web protection
 * https://github.com/drive9security/tripwire-pace
 *
 * Drop this script into your <head> tag.
 * No dependencies. No build step.
 *
 * What it does:
 *   - New visitors see a brief welcome gate that explains the site
 *   - Each page load starts a read timer based on word count
 *   - Moving to the next page before that timer elapses triggers a hold
 *   - A hidden honeypot link flags and blocks non-human navigation
 *   - Session state is server-signed via a Cloudflare Worker
 *   - Tokens cannot be forged or edited client-side
 *
 * What it doesn't do:
 *   - It does not track users
 *   - It does not sell or share data
 *   - It does not require a database
 *
 * License: MIT
 * Built by Drive9 Security — drive9security.com
 */

(function () {

  // ── CONFIGURATION ───────────────────────────────────────────────────────────

  var CONFIG = {

    // Your Cloudflare Worker URL — no trailing slash
    workerUrl: 'https://tripwire-pace.glint-2c8.workers.dev',

    // Reading speed used to calculate page gate duration (words per minute)
    wpm: 200,

    // Minimum time before the next page is available (milliseconds)
    // Used client-side as a floor — server may issue longer durations with jitter
    floorMs: 60000,

    // The gate fires if the next request arrives before this fraction
    // of the estimated read time has elapsed
    gateRatio: 0.75,

    // Cookie name — change this if you have a naming conflict
    cookieName: 'tw_pace',

    // CSS selector for the element whose text is measured for word count
    // Narrow this to your article container for better accuracy
    // Example: '#article-body' or '.post-content'
    contentSelector: 'body',

    // Welcome gate messages
    welcomeTitle: 'Welcome.',
    welcomeBody: 'Your session will begin shortly. This site uses Tripwire &mdash; ' +
      'an anti-AI, anti-scraping measure. Pages load at human reading speed. ' +
      'If you\'re a person, you won\'t notice a thing.',

    // Page gate messages
    gateTitle: 'This website moves at human speed.',
    gateBody: 'Content is restricted to human browsing access.',

    // Honeypot flagged messages
    flagTitle: 'Session flagged.',
    flagBody: 'Non-human navigation was detected. Automated access is not permitted by this site.'

  };

  // ── END CONFIGURATION ───────────────────────────────────────────────────────


  // ── COOKIE ──────────────────────────────────────────────────────────────────
  // Stores the server-signed token client-side.
  // The token is opaque to the client — editing it breaks the signature.

  function getCookie() {
    var name = CONFIG.cookieName + '=';
    var parts = document.cookie.split(';');
    for (var i = 0; i < parts.length; i++) {
      var c = parts[i].trim();
      if (c.indexOf(name) === 0) {
        try { return JSON.parse(decodeURIComponent(c.substring(name.length))); }
        catch (e) { return null; }
      }
    }
    return null;
  }

  function setCookie(data) {
    document.cookie = CONFIG.cookieName + '=' +
      encodeURIComponent(JSON.stringify(data)) +
      '; path=/; SameSite=Strict';
  }

  function clearCookie() {
    document.cookie = CONFIG.cookieName + '=; path=/; max-age=0; SameSite=Strict';
  }


  // ── WORKER CALLS ────────────────────────────────────────────────────────────

  function fetchSession() {
    return fetch(CONFIG.workerUrl + '/.well-known/tripwire/session')
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function checkToken(token, pageTitle, pageGateMs) {
    return fetch(CONFIG.workerUrl + '/.well-known/tripwire/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, title: pageTitle, gateMs: pageGateMs })
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return { status: 'clear' }; });
  }

  function updateToken(token, title, gateMs) {
    return fetch(CONFIG.workerUrl + '/.well-known/tripwire/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, title: title, gateMs: gateMs })
    })
      .then(function (r) { return r.json(); })
      .catch(function () { return null; });
  }

  function reportHoneypot(token) {
    return fetch(CONFIG.workerUrl + '/internal/resources/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token })
    }).catch(function () {});
  }


  // ── WORD COUNT ──────────────────────────────────────────────────────────────

  function wordCount() {
    var el = document.querySelector(CONFIG.contentSelector);
    if (!el) return 0;
    return el.innerText.trim().split(/\s+/).filter(Boolean).length;
  }

  function readTimeMs() {
    return Math.max(CONFIG.floorMs, (wordCount() / CONFIG.wpm) * 60 * 1000);
  }


  // ── OVERLAY ─────────────────────────────────────────────────────────────────

  var overlay = null;
  var overlayTick = null;

  function injectStyles() {
    if (document.getElementById('tw-styles')) return;
    var style = document.createElement('style');
    style.id = 'tw-styles';
    style.textContent = [
      '#tw-overlay{position:fixed;inset:0;z-index:2147483647;',
      'background:#fff;display:flex;flex-direction:column;',
      'align-items:center;justify-content:center;gap:14px;',
      'padding:40px;text-align:center;font-family:sans-serif;}',
      '@media(prefers-color-scheme:dark){#tw-overlay{background:#0a0a0a;}}',
      '#tw-overlay h1{margin:0;font-size:22px;font-weight:500;color:#111;}',
      '@media(prefers-color-scheme:dark){#tw-overlay h1{color:#f0f0f0;}}',
      '#tw-overlay p{margin:0;font-size:14px;line-height:1.7;color:#555;max-width:380px;}',
      '@media(prefers-color-scheme:dark){#tw-overlay p{color:#999;}}',
      '#tw-overlay .tw-bar-wrap{width:100%;max-width:320px;height:3px;',
      'background:rgba(0,0,0,0.1);border-radius:2px;overflow:hidden;}',
      '@media(prefers-color-scheme:dark){#tw-overlay .tw-bar-wrap{background:rgba(255,255,255,0.1);}}',
      '#tw-overlay .tw-bar-fill{height:3px;background:#555;border-radius:2px;width:0%;}',
      '@media(prefers-color-scheme:dark){#tw-overlay .tw-bar-fill{background:#999;}}',
      '#tw-overlay .tw-meta{font-size:12px;color:#999;}'
    ].join('');
    document.head.appendChild(style);
  }

  function showOverlay(title, body, durationMs, onComplete) {
    injectStyles();
    removeOverlay();

    overlay = document.createElement('div');
    overlay.id = 'tw-overlay';
    overlay.setAttribute('aria-live', 'polite');
    overlay.setAttribute('role', 'status');

    var h1 = document.createElement('h1');
    h1.innerHTML = title;

    var p = document.createElement('p');
    p.innerHTML = body;

    var wrap = document.createElement('div');
    wrap.className = 'tw-bar-wrap';
    var bar = document.createElement('div');
    bar.className = 'tw-bar-fill';
    wrap.appendChild(bar);

    var meta = document.createElement('div');
    meta.className = 'tw-meta';
    meta.textContent = Math.ceil(durationMs / 1000) + 's';

    overlay.appendChild(h1);
    overlay.appendChild(p);
    overlay.appendChild(wrap);
    overlay.appendChild(meta);
    document.body.appendChild(overlay);

    setTimeout(function () {
      bar.style.transition = 'width ' + (durationMs / 1000) + 's linear';
      bar.style.width = '100%';
    }, 50);

    var start = Date.now();
    overlayTick = setInterval(function () {
      var remaining = Math.max(0, durationMs - (Date.now() - start));
      meta.textContent = remaining > 0
        ? Math.ceil(remaining / 1000) + 's'
        : 'Ready.';
      if (remaining <= 0) {
        clearInterval(overlayTick);
        overlayTick = null;
        removeOverlay();
        if (typeof onComplete === 'function') onComplete();
      }
    }, 500);
  }

  function showGateOverlay(fromTitle, remainingMs, onComplete) {
    injectStyles();
    removeOverlay();

    overlay = document.createElement('div');
    overlay.id = 'tw-overlay';

    var h1 = document.createElement('h1');
    h1.textContent = CONFIG.gateTitle;

    var p = document.createElement('p');
    p.textContent = CONFIG.gateBody +
      (fromTitle ? ' Still reading: \u201c' + fromTitle + '\u201d' : '');

    var wrap = document.createElement('div');
    wrap.className = 'tw-bar-wrap';
    var bar = document.createElement('div');
    bar.className = 'tw-bar-fill';
    wrap.appendChild(bar);

    var meta = document.createElement('div');
    meta.className = 'tw-meta';
    meta.textContent = 'Available in ' + Math.ceil(remainingMs / 1000) + 's';

    overlay.appendChild(h1);
    overlay.appendChild(p);
    overlay.appendChild(wrap);
    overlay.appendChild(meta);
    document.body.appendChild(overlay);

    setTimeout(function () {
      bar.style.transition = 'width ' + (remainingMs / 1000) + 's linear';
      bar.style.width = '100%';
    }, 50);

    var start = Date.now();
    overlayTick = setInterval(function () {
      var rem = Math.max(0, remainingMs - (Date.now() - start));
      meta.textContent = rem > 0
        ? 'Available in ' + Math.ceil(rem / 1000) + 's'
        : 'Ready.';
      if (rem <= 0) {
        clearInterval(overlayTick);
        overlayTick = null;
        removeOverlay();
        if (typeof onComplete === 'function') onComplete();
      }
    }, 500);
  }

  function showFlaggedOverlay() {
    injectStyles();
    removeOverlay();
    overlay = document.createElement('div');
    overlay.id = 'tw-overlay';
    var h1 = document.createElement('h1');
    h1.textContent = CONFIG.flagTitle;
    var p = document.createElement('p');
    p.textContent = CONFIG.flagBody;
    overlay.appendChild(h1);
    overlay.appendChild(p);
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    if (overlayTick) { clearInterval(overlayTick); overlayTick = null; }
    if (overlay && overlay.parentNode) { overlay.parentNode.removeChild(overlay); }
    overlay = null;
  }


  // ── HONEYPOT ─────────────────────────────────────────────────────────────────
  // Invisible to humans. DOM walkers following all hrefs will find it.
  // Hit is logged server-side by the Worker — cannot be cleared client-side.

  function injectHoneypot(token) {
    var a = document.createElement('a');
    a.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:1px',
      'height:1px',
      'overflow:hidden',
      'clip:rect(0,0,0,0)',
      'white-space:nowrap',
      'pointer-events:none',
      'user-select:none',
      'font-size:0',
      'line-height:0',
      'z-index:-1'
    ].join(';');
    a.href = '/internal/resources/index';
    a.tabIndex = -1;
    a.setAttribute('aria-hidden', 'true');
    a.textContent = '\u200b';
    a.addEventListener('click', function (e) {
      e.preventDefault();
      reportHoneypot(token).then(function () {
        clearCookie();
        showFlaggedOverlay();
      });
    });
    document.body.appendChild(a);
  }


  // ── STATE MACHINE ────────────────────────────────────────────────────────────
  // States:
  //   NO_TOKEN         → fetch signed token from Worker → show welcome gate
  //   WELCOME_PENDING  → gate counting down → on complete, update token
  //   READING          → page loaded, read timer running server-side
  //   GATED            → moved too fast → hold until Worker clears it
  //   FLAGGED          → honeypot tripped → session blocked server-side

  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  function run() {
    var cookie = getCookie();

    // Flagged client-side — belt and suspenders alongside server flag
    if (cookie && cookie.flagged) {
      showFlaggedOverlay();
      return;
    }

    // No token — new session, fetch one from the Worker
    if (!cookie || !cookie.token) {
      fetchSession().then(function (data) {
        if (!data || !data.token) {
          // Worker unreachable — fail open, never block a human
          return;
        }
        setCookie({ token: data.token, flagged: false });
        showOverlay(
          CONFIG.welcomeTitle,
          CONFIG.welcomeBody,
          data.welcomeMs,
          function () { onWelcomeComplete(data.token); }
        );
      });
      return;
    }

    // Have a token — check it with the Worker
    var rt     = readTimeMs();
    var gateMs = Math.floor(rt * CONFIG.gateRatio);

    checkToken(cookie.token, document.title, gateMs).then(function (result) {
      if (!result) return;

      // Token tampered — treat as new session
      if (result.error === 'invalid signature' || result.error === 'invalid token') {
        clearCookie();
        run();
        return;
      }

      // Flagged server-side
      if (result.error === 'flagged' || result.flagged) {
        setCookie({ token: cookie.token, flagged: true });
        showFlaggedOverlay();
        return;
      }

      // Welcome gate still running
      if (result.status === 'welcome') {
        showOverlay(
          CONFIG.welcomeTitle,
          CONFIG.welcomeBody,
          result.remaining,
          function () { onWelcomeComplete(cookie.token); }
        );
        return;
      }

      // Page gate active
      if (result.status === 'gated') {
        showGateOverlay(result.title, result.remaining, function () {
          onPageLoad(cookie.token);
        });
        return;
      }

      // Clear to read
      onPageLoad(cookie.token);
    });
  }

  function onWelcomeComplete(token) {
    var gateMs = Math.floor(readTimeMs() * CONFIG.gateRatio);
    updateToken(token, document.title, gateMs).then(function (data) {
      var activeToken = (data && data.token) ? data.token : token;
      if (data && data.token) setCookie({ token: data.token, flagged: false });
      injectHoneypot(activeToken);
    });
  }

  function onPageLoad(token) {
    var gateMs = Math.floor(readTimeMs() * CONFIG.gateRatio);
    updateToken(token, document.title, gateMs).then(function (data) {
      var activeToken = (data && data.token) ? data.token : token;
      if (data && data.token) setCookie({ token: data.token, flagged: false });
      injectHoneypot(activeToken);
    });
  }

  // Boot
  init();

})();
