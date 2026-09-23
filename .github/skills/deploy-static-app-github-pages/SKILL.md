---
name: deploy-static-app-github-pages
description: Prepare and deploy a static browser game, PWA, or frontend app to free GitHub Pages hosting with automated updates and live-site verification.
---

# Deploy a Static App to GitHub Pages

Use this skill when the user wants to publish a static browser game, PWA, or frontend application on GitHub Pages. It covers initial publication and repeat deployments.

## Preconditions

The application must produce static files that can be served without a persistent backend. Typical deployable files include:

- `index.html`
- CSS and client-side JavaScript
- Images, audio, fonts, and other assets
- `manifest.webmanifest` and a service worker for a PWA

If the app needs a database, server-side authentication, private secrets, or runtime server code, explain that GitHub Pages cannot host those components. Recommend a suitable backend separately rather than exposing secrets in frontend files.

## 1. Inspect the Project

Before changing anything:

1. Identify the repository root and whether Git is already initialized.
2. Inspect the entry point and asset paths.
3. Locate the project’s test, lint, type-check, and build commands.
4. Determine whether deployment should publish the repository root or generated output such as `dist/`.
5. Check for existing workflows, hosting configuration, or a configured remote.

Use repository-relative URLs in static files where practical:

```html
<script type="module" src="./src/app.js"></script>
```

Avoid root-relative project assets such as `/src/app.js`. A GitHub project site is served under `/<repository>/`, so root-relative URLs resolve against `https://owner.github.io/` and commonly break.

## 2. Make the App Pages-Compatible

For a static app deployed from the repository root:

- Ensure `index.html` is the entry point.
- Ensure all local assets use relative paths.
- Keep browser-only state in `localStorage` or IndexedDB.
- Do not include API tokens, passwords, private keys, or server secrets.
- Add a `.gitignore` for generated or machine-local files.
- Add a concise `README.md` with the live URL and local development commands.

For a PWA:

- Use relative `start_url` and icon paths in the manifest.
- Register the service worker with a relative URL.
- Include every required offline asset in the cache list.
- Increment the cache name whenever deployed assets change so existing installations receive updates.
- Remember that service workers require HTTPS in production; GitHub Pages provides it.

Example:

```js
const CACHE_NAME = "my-app-v2";

navigator.serviceWorker.register("./sw.js");
```

```json
{
  "start_url": "./",
  "display": "standalone",
  "icons": [
    {
      "src": "assets/icon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

## 3. Add the GitHub Pages Workflow

Create `.github/workflows/pages.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: ["main"]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - name: Check out repository
        uses: actions/checkout@v4

      - name: Configure Pages
        uses: actions/configure-pages@v5

      - name: Upload site
        uses: actions/upload-pages-artifact@v3
        with:
          path: .

      - name: Deploy
        id: deployment
        uses: actions/deploy-pages@v4
```

For apps with a build step, run that step before uploading and change `path` to the generated directory:

```yaml
      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Upload site
        uses: actions/upload-pages-artifact@v3
        with:
          path: dist
```

Do not upload dependency directories, secrets, or unrelated large files.

## 4. Validate Before Publishing

Run the smallest complete set of existing checks, for example:

```bash
npm test
npm run check
npm run build
```

Start a local static server and load the app through HTTP instead of opening `index.html` directly:

```bash
python3 -m http.server 4173
```

Verify:

- The landing screen loads.
- JavaScript modules and assets return successfully.
- A primary interaction works.
- Responsive layout works at a tablet-sized viewport.
- PWA manifest and service-worker paths resolve.
- Reloading does not expose stale cached files.

## 5. Initialize and Commit Safely

If Git is not initialized:

```bash
git init -b main
```

Before committing:

1. Run `git status --short`.
2. Check staged content for accidental credentials or generated artifacts.
3. Run `git diff --cached --check`.
4. Follow the repository’s existing commit-message convention when one exists.
5. Never overwrite or discard unrelated user changes.

Example initial commit:

```bash
git add -A
git commit -m "Create browser game and GitHub Pages deployment"
```

Do not push until the user has explicitly requested publication or approved pushing.

## 6. Create the GitHub Repository

Check prerequisites:

```bash
git --version
gh --version
gh auth status
```

If GitHub CLI is not authenticated, ask the user to authenticate:

```bash
gh auth login
```

Choose the repository owner and name from the user’s request. If they are ambiguous, ask before creating anything. Repository creation is externally visible and should not be guessed when multiple reasonable choices exist.

For a public repository:

```bash
gh repo create my-app \
  --public \
  --source=. \
  --remote=origin \
  --description "A short project description"
```

The expected project-site URL is:

```text
https://OWNER.github.io/REPOSITORY/
```

## 7. Enable Pages and Push

Enable GitHub Actions as the Pages build source:

```bash
gh api \
  --method POST \
  repos/OWNER/REPOSITORY/pages \
  -f build_type=workflow
```

Then publish:

```bash
git push -u origin main
```

If Pages is already configured, do not treat the API’s “already exists” response as a deployment failure. Inspect the existing Pages configuration and continue if it uses the intended workflow build type.

## 8. Wait for Deployment

Find and watch the newest Pages workflow:

```bash
run_id=$(gh run list \
  --workflow pages.yml \
  --limit 1 \
  --json databaseId \
  --jq '.[0].databaseId')

gh run watch "$run_id" --exit-status
```

If the workflow fails:

1. Inspect the failed job and logs.
2. Fix the root cause.
3. Run local validation again.
4. Commit and push the fix.
5. Watch the replacement run.

Do not report success merely because `git push` succeeded. Deployment is complete only after the Pages workflow succeeds and the public URL responds.

## 9. Verify the Public Site

Check the HTTPS response:

```bash
curl --fail --location --head \
  https://OWNER.github.io/REPOSITORY/
```

Then open the public URL in a browser and verify:

- The page title and primary UI render.
- Styles, scripts, icons, and manifest load.
- A core interaction works.
- The URL remains under the repository subpath.
- HTTPS is active.
- The service worker does not serve an older cached release.

For stubborn PWA caches during testing, unregister the development service worker and clear only that site’s cache before reloading. Do not instruct users to clear all browser data unless necessary because doing so can erase local progress.

## 10. Explain Tablet Installation and Persistence

Give the user the public URL and these installation steps:

- iPad/iPhone: open in Safari, tap **Share**, then **Add to Home Screen**.
- Android: open in Chrome, open the browser menu, then choose **Install app** or **Add to Home screen**.

Explain local persistence accurately:

- `localStorage` and IndexedDB data remain on the same browser and device.
- Progress does not automatically synchronize between devices.
- Clearing site data removes locally stored progress.
- Updating the hosted files should not erase local progress unless storage keys or migration behavior change.

## 11. Future Updates

Once configured, ordinary updates require:

```bash
git add -A
git commit -m "Describe the update"
git push
```

Every push to `main` triggers the Pages workflow. After each meaningful update:

1. Wait for the workflow to succeed.
2. Verify the live URL.
3. For PWAs, confirm the service-worker cache version changed when cached assets changed.

## Completion Checklist

Do not mark the task complete until all applicable checks pass:

- [ ] Static asset paths work under `/<repository>/`.
- [ ] No credentials or private data are committed.
- [ ] Existing tests/checks pass.
- [ ] Local browser smoke test passes.
- [ ] Pages workflow is committed.
- [ ] GitHub repository exists with the intended visibility.
- [ ] Pages uses GitHub Actions as its source.
- [ ] `main` is pushed and tracks `origin/main`.
- [ ] Pages workflow succeeds.
- [ ] Public HTTPS URL returns a successful response.
- [ ] Hosted app loads and a core interaction works.
- [ ] User receives the live URL and tablet installation instructions.
