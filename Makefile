# Jahgenda – alles Wichtige in einem Makefile. `make` zeigt die Hilfe.
SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT ?= 8000
WEB_FILES := index.html log.html style.css app.js pwa.js sw.js design/logos.html
PY_FILES  := scripts/*.py tests/*.py

.PHONY: help serve dev validate validate-strict test lint fmt fmt-data check scrape harvest deploy status clean cron-install cron-uninstall

help: ## Diese Hilfe
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[33m%-12s\033[0m %s\n", $$1, $$2}'

serve: ## Seite lokal ansehen (http://localhost:$(PORT))
	python3 -m http.server $(PORT)

dev: ## Seite lokal mit Auto-Reload (npx live-server)
	npx --yes live-server@1.2.2 --port=5500 --host=127.0.0.1 --no-browser --wait=200 --ignore=.git,tests

validate: ## Daten prüfen (data/*.json gegen criteria.md)
	python3 scripts/validate_shows.py --allow-past

validate-strict: ## Daten streng prüfen (keine vergangenen Shows) – so läuft es im Scraper
	python3 scripts/validate_shows.py

test: ## Unit-Tests für Validator und Formatierer
	python3 -m unittest discover -s tests -v

lint: ## Syntax- und Formatcheck (JS, Python, HTML/CSS via prettier)
	node --check app.js
	python3 -m py_compile $(PY_FILES)
	npx --yes prettier@3.3.3 --check $(WEB_FILES)

fmt: ## Code formatieren (prettier für HTML/CSS/JS) + Daten normalisieren
	npx --yes prettier@3.3.3 --write $(WEB_FILES)
	$(MAKE) fmt-data

fmt-data: ## data/*.json in kanonische Form bringen (Sortierung, Einrückung)
	python3 scripts/format_data.py

check: lint validate test ## Alles prüfen (vor jedem Commit)

scrape: ## Konzerte jetzt scrapen (Claude Code, läuft auf dem Abo)
	claude -p "/scrape-shows" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"

harvest: ## Bands aus Festival-Line-ups vorschlagen (Claude Code)
	claude -p "/harvest-bands" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"

deploy: check ## Prüfen, committen (falls nötig) und pushen → GitHub Pages deployt
	@git diff --quiet && git diff --cached --quiet || git commit -am "Update site"
	git push origin main
	@echo "→ https://markusbaumg.github.io/jahgenda/  (Status: make status)"

icons: ## Render PWA icons (img/icons/*.png) from img/logo/jahgenda.svg
	scripts/make_icons.sh

cron-install: ## Local fallback: run the scraper daily at 06:10 on this Mac (launchd)
	mkdir -p ~/Library/Logs/jahgenda ~/Library/LaunchAgents
	sed -e 's#__REPO__#$(CURDIR)#g' -e 's#__HOME__#$(HOME)#g' scripts/launchd/ch.jahgenda.scrape.plist > ~/Library/LaunchAgents/ch.jahgenda.scrape.plist
	launchctl unload ~/Library/LaunchAgents/ch.jahgenda.scrape.plist 2>/dev/null || true
	launchctl load ~/Library/LaunchAgents/ch.jahgenda.scrape.plist
	@echo "installed: daily 06:10 → make scrape (logs in ~/Library/Logs/jahgenda/)"

cron-uninstall: ## Remove the local launchd job
	launchctl unload ~/Library/LaunchAgents/ch.jahgenda.scrape.plist 2>/dev/null || true
	rm -f ~/Library/LaunchAgents/ch.jahgenda.scrape.plist

status: ## Letzte Deploys und Scraper-Läufe anzeigen
	gh run list -R markusbaumg/jahgenda -L 5
	@python3 -c "import json; r=json.load(open('data/runs.json'))['runs']; print('Letzter Scraper-Lauf:', r[0]['at'] if r else 'noch keiner', '-', (r[0].get('total','?') if r else ''), 'Shows')"

clean: ## Temporäre Dateien entfernen
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + ; rm -rf .pytest_cache
