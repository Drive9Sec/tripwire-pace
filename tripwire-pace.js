/*!
 * tripwire-pace.js
 * Part of the Tripwire suite — human-speed web protection
 * https://github.com/tripwire-suite/pace
 *
 * Drop this script into your <head> tag.
 * No dependencies. No build step. No server required.
 *
 * What it does:
 *   - New visitors see a brief welcome gate that explains the site
 *   - Each page load starts a read timer based on word count
 *   - Moving to the next page before that timer elapses triggers a hold
 *   - A hidden honeypot link flags and blocks non-human navigation
 *   - All state is stored in a site-wide cookie shared across tabs
 *
 * What it doesn't do:
 *   - It does not track users
 *   - It does not send data anywhere
 *   - It does not require a server
 *   - It does not stop a determined, patient adversary (nothing client-side can)
 *
 * License: MIT
 */

(function () {

  // ── CONFIGURATION ───────────────────────────────────────────────────────────
  // Adjust these values to suit your site.
  // All times are in milliseconds.

  var CONFIG = {

    // How long the welcome gate holds on a brand new session.
    // 10 seconds is enough to cost a bot meaningful throughput
    // while being barely noticeable to a human.
    welcomeMs: 10000,

    // Minimum time before the next page is available, regardless of word count.
    // 60 seconds is the production default. Reflects the lower bound of
    // human reading time for any meaningful page.
    floorMs: 60000,

    // Reading speed used to calculate page gate duration.
    // 200 words per minute is a comfortable average adult reading pace.
    wpm: 200,

    // The gate fires if the next request arrives before this fraction
    // of the estimated read time has elapsed.
    // 0.75 = gate releases after 75% of read time.
    gateRatio: 0.75,

    // Cookie name. Change this if you have a naming conflict.
    cookieName: 'tw_pace',

    // CSS selector for the element whose text is measured for word count.
    // Defaults to the whole body. Narrow this to your article container
    // if your page has a lot of navigation chrome.
    // Example: '#article-body' or '.post-content'
    contentSelector: 'body',

    // The message shown during the welcome gate.
    // Keep it honest. People appreciate knowing why.
    welcomeTitle: 'Welcome.',
    welcomeBody: 'Your session will begin shortly. This site uses Tripwire &mdash; ' +
      'an anti-AI, anti-scraping measure. Pages load at human reading speed. ' +
      'If you\'re a person, you won\'t notice a thing.',

    // The message shown when the page gate is active.
    gateTitle: 'This website moves at human speed.',
    gateBody: 'Content is restricted to human browsing access.',

    // The message shown when the honeypot has been tripped.
    flagTitle: 'Session flagged.',
    flagBody: 'Non-human navigation was detected. Automated access is not permitted by this site.'

  };
  // ── END CONFIGURATION ───────────────────────────────────────────────────────


  // ── UTILITIES ───────────────────────────────────────────────────────────────

  function wordCount() {
    var el = document.querySelector(CONFIG.contentSelector);
    if (!el) return 0;
    return el.innerText.trim().split(/\s+/).filter(Boolean).length;
  }

  function readTimeMs() {
    return Math.max(CONFIG.floorMs, (wordCount() / CONFIG.wpm) * 60 * 1000);
  }

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
    // Session cookie — no expires means it dies when the browser closes.
    // This is intentional. Each new browser session pays the welcome gate.
    document.cookie = CONFIG.cookieName + '=' +
      encodeURIComponent(JSON.stringify(data)) +
      '; path=/; SameSite=Strict';
  }

  function clearCookie() {
    document.cookie = CONFIG.cookieName + '=; path=/; max-age=0; SameSite=Strict';
  }


  // ── OVERLAY ─────────────────────────────────────────────────────────────────
  // A full-page overlay injected into the DOM when the gate is active.
  // Removed entirely when the gate clears — no trace left in the DOM.

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
      '#tw-overlay h1{margin:0;font-size:22px;font-weight:500;',
      'color:#111;letter-spacing:-0.01em;}',
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

    var h1   = document.createElement('h1');
    h1.innerHTML = title;

    var p    = document.createElement('p');
    p.innerHTML = body;

    var wrap = document.createElement('div');
    wrap.className = 'tw-bar-wrap';
    var bar  = document.createElement('div');
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

    // Animate bar
    setTimeout(function () {
      bar.style.transition = 'width ' + (durationMs / 1000) + 's linear';
      bar.style.width = '100%';
    }, 50);

    // Countdown tick
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

  function showGateOverlay(fromTitle, durationMs, elapsed, onComplete) {
    injectStyles();
    removeOverlay();

    var remaining = Math.max(0, durationMs - elapsed);
    var pct       = Math.min(100, (elapsed / durationMs) * 100);

    overlay = document.createElement('div');
    overlay.id = 'tw-overlay';

    var h1 = document.createElement('h1');
    h1.textContent = CONFIG.gateTitle;

    var p  = document.createElement('p');
    p.textContent = CONFIG.gateBody +
      (fromTitle ? ' Still reading: \u201c' + fromTitle + '\u201d' : '');

    var wrap = document.createElement('div');
    wrap.className = 'tw-bar-wrap';
    var bar = document.createElement('div');
    bar.className = 'tw-bar-fill';
    bar.style.width = pct + '%';
    wrap.appendChild(bar);

    var meta = document.createElement('div');
    meta.className = 'tw-meta';
    meta.textContent = 'Available in ' + Math.ceil(remaining / 1000) + 's';

    overlay.appendChild(h1);
    overlay.appendChild(p);
    overlay.appendChild(wrap);
    overlay.appendChild(meta);
    document.body.appendChild(overlay);

    setTimeout(function () {
      bar.style.transition = 'width ' + (remaining / 1000) + 's linear';
      bar.style.width = '100%';
    }, 50);

    var start = Date.now();
    overlayTick = setInterval(function () {
      var rem2 = Math.max(0, remaining - (Date.now() - start));
      meta.textContent = rem2 > 0
        ? 'Available in ' + Math.ceil(rem2 / 1000) + 's'
        : 'Ready.';
      if (rem2 <= 0) {
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


  // ── HONEYPOT ────────────────────────────────────────────────────────────────
  // An invisible link injected into the page.
  // No human will ever find or click it.
  // A DOM-walking scraper following all hrefs will.
  //
  // Intentionally avoids the canonical honeypot signatures
  // (display:none, visibility:hidden, opacity:0) which are
  // filtered by aware scrapers. Instead uses a combination of
  // techniques that are harder to detect programmatically.

  function injectHoneypot() {
    var a = document.createElement('a');

    // Positioned off-canvas using clip rather than display/visibility/opacity
    a.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'width:1px',
      'height:1px',
      'overflow:hidden',
      'clip:rect(0,0,0,0)',
      'white-space:nowrap',
      'pointer-events:none',    // humans can't accidentally click it
      'user-select:none',
      'font-size:0',
      'line-height:0',
      'z-index:-1'
    ].join(';');

    // Give it an href that looks like a real internal link
    // A scraper building a link list will find it plausible
    a.href = '/internal/resources/index';
    a.tabIndex = -1;
    a.setAttribute('aria-hidden', 'true');
    a.textContent = '\u200b'; // zero-width space — not empty, not readable

    a.addEventListener('click', function (e) {
      e.preventDefault();
      tripHoneypot();
    });

    document.body.appendChild(a);
  }

  function tripHoneypot() {
    var c = getCookie();
    setCookie({ flagged: true, firstLoadComplete: c ? c.firstLoadComplete : false });
    showFlaggedOverlay();
  }


  // ── STATE MACHINE ───────────────────────────────────────────────────────────
  // States:
  //   NO_COOKIE        → show welcome gate → write cookie → READING
  //   READING          → page loads normally, read timer starts
  //   GATED            → next page requested before timer elapsed → hold
  //   FLAGGED          → honeypot tripped → block session

  function init() {
    // Don't run until the DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  }

  function run() {
    var cookie = getCookie();

    // ── FLAGGED ──
    if (cookie && cookie.flagged) {
      showFlaggedOverlay();
      return;
    }

    // ── NO COOKIE: first ever visit, show welcome gate ──
    if (!cookie || !cookie.firstLoadComplete) {
      setCookie({ firstLoadComplete: false, flagged: false });
      showOverlay(
        CONFIG.welcomeTitle,
        CONFIG.welcomeBody,
        CONFIG.welcomeMs,
        function () {
          // Welcome gate complete — record first load, start read timer
          var rt     = readTimeMs();
          var gateMs = Math.floor(rt * CONFIG.gateRatio);
          setCookie({
            firstLoadComplete: true,
            flagged:           false,
            title:             document.title,
            start:             Date.now(),
            gateMs:            gateMs
          });
          injectHoneypot();
        }
      );
      return;
    }

    // ── FIRST LOAD COMPLETE: check page gate ──
    var now     = Date.now();
    var elapsed = cookie.start ? now - cookie.start : Infinity;
    var gateOpen = !cookie.start || elapsed >= cookie.gateMs;

    if (!gateOpen) {
      // Tripwire fired — too fast
      showGateOverlay(
        cookie.title || '',
        cookie.gateMs,
        elapsed,
        function () {
          // Gate cleared — record this page load
          var rt     = readTimeMs();
          var gateMs = Math.floor(rt * CONFIG.gateRatio);
          setCookie({
            firstLoadComplete: true,
            flagged:           false,
            title:             document.title,
            start:             Date.now(),
            gateMs:            gateMs
          });
          injectHoneypot();
        }
      );
      return;
    }

    // ── CLEAR TO READ: normal page load ──
    var rt     = readTimeMs();
    var gateMs = Math.floor(rt * CONFIG.gateRatio);
    setCookie({
      firstLoadComplete: true,
      flagged:           false,
      title:             document.title,
      start:             Date.now(),
      gateMs:            gateMs
    });
    injectHoneypot();
  }

  // Boot
  init();

})();
