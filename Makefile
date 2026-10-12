# Jahgenda – everything you can run. `make` shows the help.
SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8000
WEB_FILES := index.html log.html review.html mischpult.html style.css store.js lib.js app.js pwa.js callout.js sw.js design/logos.html tests/lib.test.mjs e2e/*.js e2e/tests/*.js
PY_FILES  := scripts/*.py tests/*.py
# A prettier on PATH wins; otherwise npx, which reuses its cache without a registry round-trip
# once prettier@3.3.3 has been fetched once (so make check also works on a train).
PRETTIER  := $(shell command -v prettier 2>/dev/null || echo npx --yes --prefer-offline prettier@3.3.3)

.PHONY: help serve dev validate validate-strict test lint fmt fmt-data check scrape harvest deploy status clean cron-install cron-uninstall icons stickers watchdog venues-check ci smoke e2e quality-review ics

help: ## This help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-12s\033[0m %s\n", $$1, $$2}'

serve: ## View the page locally (http://localhost:$(PORT))
	python3 -m http.server $(PORT)

dev: ## Local preview with live reload (npx live-server)
	npx --yes live-server@1.2.2 --port=5500 --host=127.0.0.1 --no-browser --wait=200 --ignore=.git,tests

validate: ## Validate data/*.json (past shows allowed, as in CI)
	python3 scripts/validate_shows.py --allow-past

validate-strict: ## Validate strictly (no past shows) – what the scraper runs
	python3 scripts/validate_shows.py

test: ## Unit tests: Python (validator, formatter, watchdog, venue check, contract) and node (lib.js)
	python3 -m unittest discover -s tests -v
	node --test tests/*.test.mjs

lint: ## Syntax and format check (JS, Python via ruff if installed, HTML/CSS via prettier)
	@! grep -rnE '^\s*(<<<<<<< |>>>>>>> |=======$$)' --include='*.html' --include='*.css' --include='*.js' --include='*.py' --include='*.md' --include='*.json' --include='Makefile' . --exclude-dir=.git --exclude-dir=.claude --exclude-dir=node_modules || (echo "lint: merge conflict markers found" && exit 1)
	@! ls _*.html >/dev/null 2>&1 || (echo "lint: workflow scratch pages (_*.html) in the tree, delete them" && exit 1)
	node --check store.js lib.js app.js pwa.js callout.js sw.js
	@if ruff --version >/dev/null 2>&1; then ruff check scripts tests && ruff format --check scripts tests; else python3 -m py_compile $(PY_FILES); fi
	$(PRETTIER) --check $(WEB_FILES)

fmt: ## Format code (prettier for HTML/CSS/JS, ruff if installed) and normalise data
	$(PRETTIER) --write $(WEB_FILES)
	@if ruff --version >/dev/null 2>&1; then ruff format scripts tests && ruff check --fix scripts tests; fi
	$(MAKE) fmt-data

fmt-data: ## Bring data/*.json into canonical form (sorting, indentation)
	python3 scripts/format_data.py

check: lint validate test smoke ## Run everything (before every commit)
	python3 scripts/format_data.py --check

smoke: ## Load both pages in headless Chrome and fail on uncaught JS errors
	scripts/smoke.sh

e2e: ## End-to-end tests in a real browser (Playwright, e2e/): desktop Chrome + iPhone; not part of check
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

icons: ## Render PWA icons (img/icons/*.png) from img/logo/jahgenda.svg
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

ics: ## Build the subscribable calendar feeds (jahgenda.ics + per canton) into the repo root
	python3 scripts/make_ics.py .

quality-review: ## Preview the weekly quality-review issue (dropped candidates), without touching GitHub
	DRY_RUN=1 python3 scripts/quality_review.py --days 7

watchdog: ## Freshness check (same as the GitHub watchdog), without touching GitHub
	DRY_RUN=1 python3 scripts/check_freshness.py --max-age-hours 36

status: ## Show the last deploys and the last scraper run
	gh run list -R markusbaumg/jahgenda -L 5
	@python3 -c "import json; r=json.load(open('data/runs.json'))['runs']; print('Last scraper run:', r[0]['at'] if r else 'none yet', '-', (r[0].get('total','?') if r else ''), 'shows')"

clean: ## Remove temporary files
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + ; rm -rf .ruff_cache
