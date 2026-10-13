# Jahgenda – everything you can run. `make` shows the help.
SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8000
# Prettier targets: the Vite entry, the source tree (JS, Svelte via
# prettier-plugin-svelte), the plain scripts and static pages in public/, config, tests and the e2e project.
WEB_FILES := index.html mischpult.html vite.config.js src public/*.html public/*.js design/logos.html tests/*.test.mjs e2e/*.js e2e/tests/*.js
PY_FILES  := scripts/*.py tests/*.py
# ruff on PATH, else via uvx (same version as CI); without both, lint fails loudly instead of skipping
RUFF := $(shell command -v ruff >/dev/null 2>&1 && echo ruff || (command -v uvx >/dev/null 2>&1 && echo "uvx ruff") || echo "python3 -m ruff")
# prettier comes with the root package.json (pinned, with the Svelte plugin): `make deps` installs it.
PRETTIER := node_modules/.bin/prettier
VITE     := node_modules/.bin/vite

.PHONY: help serve dev deps build validate validate-strict test lint fmt fmt-data check scrape harvest deploy status clean cron-install cron-uninstall icons stickers watchdog venues-check ci smoke e2e quality-review ics

help: ## This help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-12s\033[0m %s\n", $$1, $$2}'

# npm ci only when package-lock.json is newer than the last install (or node_modules is missing).
node_modules/.package-lock.json: package-lock.json
	npm ci --no-fund --no-audit
	@touch node_modules/.package-lock.json

deps: node_modules/.package-lock.json ## Install the pinned node dependencies (npm ci)

build: deps ## Production build into dist/ (npm ci + vite build; data/ is copied, sw.js + manifest via vite-plugin-pwa)
	$(VITE) build

dev: deps ## Dev server with hot reload (http://127.0.0.1:5173, data/ served from the repo)
	$(VITE)

serve: build ## View the production build locally (http://127.0.0.1:4173, vite preview)
	$(VITE) preview

validate: ## Validate data/*.json (past shows allowed, as in CI)
	python3 scripts/validate_shows.py --allow-past

validate-strict: ## Validate strictly (no past shows) – what the scraper runs
	python3 scripts/validate_shows.py

test: ## Unit tests: Python (validator, formatter, watchdog, venue check, contract) and node (src/lib)
	python3 -m unittest discover -s tests -v
	node --test tests/*.test.mjs

lint: deps ## Syntax and format check (plain scripts via node, Python via ruff – PATH or uvx –, the rest via prettier)
	@! grep -rnE '^\s*(<<<<<<< |>>>>>>> |=======$$)' --include='*.html' --include='*.css' --include='*.js' --include='*.svelte' --include='*.py' --include='*.md' --include='*.json' --include='Makefile' . --exclude-dir=.git --exclude-dir=.claude --exclude-dir=node_modules --exclude-dir=dist || (echo "lint: merge conflict markers found" && exit 1)
	@! ls _*.html >/dev/null 2>&1 || (echo "lint: workflow scratch pages (_*.html) in the tree, delete them" && exit 1)
	node --check public/store.js src/sw.js
	@$(RUFF) check scripts tests && $(RUFF) format --check scripts tests
	$(PRETTIER) --check $(WEB_FILES)

fmt: deps ## Format code (prettier for HTML/CSS/JS/Svelte, ruff for Python) and normalise data
	$(PRETTIER) --write $(WEB_FILES)
	$(RUFF) format scripts tests && $(RUFF) check --fix scripts tests
	$(MAKE) fmt-data

fmt-data: ## Bring data/*.json into canonical form (sorting, indentation)
	python3 scripts/format_data.py

check: lint validate test build smoke ## Run everything (before every commit): lint, validate, tests, build, smoke
	python3 scripts/format_data.py --check

smoke: ## Load the built pages (dist/) in headless Chrome and fail on uncaught JS errors
	scripts/smoke.sh

e2e: build ## End-to-end tests in a real browser (Playwright, e2e/, against vite preview of dist/): desktop Chrome + iPhone; not part of check
	cd e2e && (test -f package-lock.json && npm ci || npm install) && npx playwright install chromium && npx playwright test

ci: check ## What GitHub Actions runs (validate.yml)

scrape: ## Scrape shows now (Claude Code, runs on the subscription)
	JAHGENDA_RUNNER=$${JAHGENDA_RUNNER:-local} claude -p "/scrape-shows" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"

harvest: ## Suggest bands from festival line-ups (Claude Code)
	JAHGENDA_RUNNER=$${JAHGENDA_RUNNER:-local} claude -p "/harvest-bands" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"

deploy: check ## Check, commit (if needed) and push → GitHub Pages deploys
	@git diff --quiet && git diff --cached --quiet || git commit -am "Update site"
	git push origin main
	@echo "→ https://markusbaumg.github.io/jahgenda/  (status: make status)"

icons: ## Render PWA icons (public/img/icons/*.png) from public/img/logo/jahgenda.svg
	scripts/make_icons.sh

stickers: ## Sticker print files (design/stickers/): SVG + PDF via headless Chrome, QR via segno in .venv-stickers
	@test -x .venv-stickers/bin/python || (python3 -m venv .venv-stickers && .venv-stickers/bin/pip install --quiet segno)
	.venv-stickers/bin/python scripts/make_stickers.py --verify

cron-install: ## Local fallback: run the scraper daily at 06:10 on this Mac (launchd)
	mkdir -p ~/Library/Logs/jahgenda ~/Library/LaunchAgents
	sed -e 's#__REPO__#$(CURDIR)#g' -e 's#__HOME__#$(HOME)#g' scripts/launchd/ch.jahgenda.scrape.plist > ~/Library/LaunchAgents/ch.jahgenda.scrape.plist
	launchctl unload ~/Library/LaunchAgents/ch.jahgenda.scrape.plist 2>/dev/null || true
	launchctl load ~/Library/LaunchAgents/ch.jahgenda.scrape.plist
	@echo "installed: daily 06:10 → make scrape (logs in ~/Library/Logs/jahgenda/)"

cron-uninstall: ## Remove the local launchd job
	launchctl unload ~/Library/LaunchAgents/ch.jahgenda.scrape.plist 2>/dev/null || true
	rm -f ~/Library/LaunchAgents/ch.jahgenda.scrape.plist

venues-check: ## Re-check every venue's coordinates against OpenStreetMap (Nominatim)
	python3 scripts/check_venues.py

ics: ## Build the subscribable calendar feeds (jahgenda.ics + per canton) into dist/ (after make build)
	python3 scripts/make_ics.py dist

quality-review: ## Preview the weekly quality-review issue (dropped candidates), without touching GitHub
	DRY_RUN=1 python3 scripts/quality_review.py --days 7

watchdog: ## Freshness check (same as the GitHub watchdog), without touching GitHub
	DRY_RUN=1 python3 scripts/check_freshness.py --max-age-hours 36

status: ## Show the last deploys and the last scraper run
	gh run list -R markusbaumg/jahgenda -L 5
	@python3 -c "import json; r=json.load(open('data/runs.json'))['runs']; print('Last scraper run:', r[0]['at'] if r else 'none yet', '-', (r[0].get('total','?') if r else ''), 'shows')"

clean: ## Remove temporary files and the build
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + ; rm -rf .ruff_cache dist
