# orbitalcommons.github.io

The OrbitalCommons landing page, served at <https://orbitalcommons.github.io/>.

A single static `index.html` with no build step and no dependencies. Edit it and merge to
`main`; GitHub Pages publishes from the repository root. `.nojekyll` keeps Pages from running
the files through Jekyll.

Project cards are maintained by hand. When a repository is added to the organisation, or a
description changes, update the list in `index.html`.

Note that per-project sites live under their own paths (for example `/rizzma/`, published from
that repository's `gh-pages` branch) and are not affected by anything here.

## Development checks

The published site is plain HTML, CSS, and JavaScript. Node and Python are used
only for development checks; GitHub Pages does not install or build anything.

```sh
npm ci
npx playwright install chromium
npm test
```

`npm run test:links` checks local links, fragment identifiers, image alternative
text, and basic document metadata with Python's standard library.
`npm run test:browser` opens every page at desktop and mobile sizes and checks
for script errors, failed local requests, and horizontal overflow. Set
`CHROME_PATH` to use a locally installed Chrome instead of Playwright's browser.
GitHub Actions runs both on pull requests and pushes to `main`, and uploads
browser traces and screenshots when a check fails.

For a local preview, run `npm run serve` and open <http://127.0.0.1:4173>.
