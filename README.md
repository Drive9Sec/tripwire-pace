# tripwire-pace

**Human-speed web protection. Drop it in. That's it.**

Tripwire-pace is a lightweight, dependency-free JavaScript library that enforces human reading speed on your site. It gates page navigation behind a timer calculated from your content's word count, flags non-human navigation patterns, and catches headless browsers through a honeypot link that no real visitor would ever find.

No build step. No backend. No server required. No tracking. No data leaves the browser.

---

## Why this exists

Automated tools are consuming web content at a scale the web was never designed for. Headless browsers like Selenium, Playwright, and Puppeteer can crawl an entire site in seconds, collect everything on it, and feed it into aggregation pipelines that most site owners never consented to.

Tripwire-pace pushes back. It does not try to identify bots through fingerprinting or block them by IP. Instead it enforces a simple rule: pages become available at human reading speed, and anything moving faster than a person can read gets held at the gate.

The approach is passive and low friction for real visitors. Most people will never notice it's there.

---

## What it protects against

Tripwire-pace is most effective against headless browser scrapers. This includes:

- **Selenium** -- the most widely deployed browser automation framework
- **Playwright** -- Microsoft's modern headless browser library, increasingly common in scraping infrastructure
- **Puppeteer** -- Google's Chrome-specific headless tool, a staple of content harvesting pipelines
- **Splash** -- a headless browser built specifically for scraping integration with tools like Scrapy
- **Apify and Bright Data** -- commercial scraping platforms that use headless browsers at scale

These tools execute JavaScript, which means they hit Tripwire's gates the same way a real browser would. They can be slowed, flagged, and blocked.

### What it does not protect against

Curl, wget, and simple HTTP library scrapers that never execute JavaScript will bypass the client-side layer entirely. This is a fundamental constraint of any browser-based solution, not a limitation specific to Tripwire.

If your threat model is bulk harvesters running cheap HTTP requests, server-side middleware is the right tool for the job. If your threat model is headless browser scraping -- which is more sophisticated, more targeted, and increasingly the method of choice for OSINT and data aggregation work -- Tripwire-pace addresses that directly.

A determined, patient adversary who mimics human timing precisely will also get through. Nothing client-side can stop that. Tripwire raises the cost and complexity of automated access significantly, but it is not a guarantee against every possible technique.

---

## How it works

**Welcome gate**

New visitors see a brief introductory screen on their first session. The gate counts down for a configurable duration before the site becomes available. This sets the expectation for human visitors and immediately breaks automated tools that expect instant access.

**Read timer**

Each page load calculates a read time from the word count of your content, using a configurable words-per-minute value. The next page in a session does not become available until a meaningful fraction of that read time has elapsed. Moving faster triggers a hold.

**Gate overlay**

When a visitor moves too fast, a full-page overlay holds them at the current page until the timer clears. The progress bar picks up from where it left off rather than restarting, so the remaining wait is always accurate.

**Honeypot link**

A hidden link is injected into the DOM on each page. It is invisible to human visitors -- positioned off screen, clipped to zero size, aria-hidden, and excluded from tab order. DOM walkers that follow every href on a page will find it. Clicking it flags the session immediately.

The honeypot deliberately avoids the most common invisible element signatures like `display:none` and `visibility:hidden`, which aware scrapers actively filter for. It uses clip and pointer-events instead, which are harder to detect programmatically.

**Session state**

All state is stored in a session cookie that expires when the browser closes. No data is sent anywhere. Each new browser session pays the welcome gate again.

---

## Known gaps

The honeypot trips on click events. A DOM walker that reads hrefs and makes direct HTTP requests without firing a click event will not trigger it. Closing that gap requires a server-side canary endpoint, which is outside the scope of a client-side only tool.

If you have server access and want that layer of protection, pairing Tripwire-pace with server-side middleware that monitors requests to the honeypot path is the right approach.

---

## Installation

Drop the script into your `<head>` tag:

```html
<script src="tripwire-pace.js"></script>
```

No npm. No bundler. No dependencies. No accounts to create.

---

## Configuration

All options live in the `CONFIG` block at the top of the script:

```javascript
var CONFIG = {

  // How long the welcome gate holds on a brand new session (milliseconds)
  welcomeMs: 10000,

  // Minimum time before the next page is available, regardless of word count
  floorMs: 60000,

  // Reading speed used to calculate page gate duration (words per minute)
  wpm: 200,

  // Gate fires if next request arrives before this fraction of read time
  // 0.75 means the gate releases after 75% of estimated read time has passed
  gateRatio: 0.75,

  // Cookie name -- change this if you have a naming conflict
  cookieName: 'tw_pace',

  // CSS selector for the element used to calculate word count
  // Defaults to the whole body. Narrow this to your content container
  // for more accurate read times on pages with heavy navigation chrome.
  // Example: '#article-body' or '.post-content'
  contentSelector: 'body',

  // Welcome gate copy
  welcomeTitle: 'Welcome.',
  welcomeBody: 'Your session will begin shortly. This site uses Tripwire -- ' +
    'an anti-AI, anti-scraping measure. Pages load at human reading speed. ' +
    'If you\'re a person, you won\'t notice a thing.',

  // Page gate copy
  gateTitle: 'This website moves at human speed.',
  gateBody: 'Content is restricted to human browsing access.',

  // Honeypot flagged copy
  flagTitle: 'Session flagged.',
  flagBody: 'Non-human navigation was detected. Automated access is not permitted by this site.'

};
```

### Narrowing the content selector

By default Tripwire measures the word count of the entire `body`. For more accurate read times on content-heavy sites, point it at your article container:

```javascript
contentSelector: '#article-body'
```

This prevents navigation elements, sidebars, and footers from inflating the word count and producing unrealistically long gate times.

### Customizing the honeypot path

The honeypot link defaults to `/internal/resources/index`. If that path conflicts with a real route on your site, change the `href` value near the bottom of the honeypot function:

```javascript
a.href = '/your/custom/path';
```

Pick something that looks like a plausible internal resource but does not actually exist on your site.

---

## What visitors see

Real visitors see a clean, minimal overlay during the welcome gate and any hold periods. It shows a title, a short explanation, and a progress bar counting down to availability. The design respects the visitor's system color scheme through a `prefers-color-scheme` media query, so it looks at home on both light and dark sites.

All copy is fully configurable. The default messaging is honest with visitors about what Tripwire is and why it exists.

---

## Session behavior

- The session cookie expires when the browser closes
- Each new browser session pays the welcome gate
- State is shared across tabs on the same origin, so opening a link in a new tab does not reset the timer
- A flagged session stays flagged until the browser is closed

---

## Where it works best

Tripwire-pace is well suited for:

- **Personal websites and portfolios** where content is being scraped and republished without permission
- **Independent publishers and blogs** that want to slow automated harvesting of their writing
- **Privacy-focused personal pages** where OSINT tooling is a specific concern
- **Any site where the content itself is the asset** and automated bulk collection degrades its value

It is designed as a drop-in for sites that do not have server-side scripting available, or where adding middleware is not practical. If you do have server access, a layered approach combining Tripwire-pace with server-side request monitoring will give you broader coverage.

---

## License

Tripwire-pace is licensed under the GNU Affero General Public License v3.

You can use, modify, and distribute it freely. If you build a hosted service on top of it, that service must also be open source under the same license. Commercial use outside those terms requires a separate license agreement.

For commercial licensing inquiries, contact us at drive9security.com.

---

## Built by

Drive9 Security -- drive9security.com

Tripwire-pace is part of the Tripwire suite of human-speed web protection tools.
