# Jahgenda – alles Wichtige in einem Makefile. `make` (ohne Ziel) zeigt die Hilfe.
#
# Braucht: bash, python3, node/npx (prettier, live-server), optional ruff, gh, claude.
# Keine Installation nötig: prettier und live-server laufen über npx, Python ist stdlib-only.
SHELL := /bin/bash
.DEFAULT_GOAL := help

PORT      ?= 8000
PRETTIER  := npx --yes prettier@3.3.3
WEB_FILES := index.html log.html style.css app.js design/logos.html
PY_DIRS   := scripts tests
REPO      := markusbaumg/jahgenda

.PHONY: help serve dev validate validate-strict test lint fmt fmt-data check ci scrape harvest deploy status \
	cron-install cron-uninstall clean

help: ## Diese Hilfe
	@printf "\n  \033[1mJahgenda\033[0m – Reggae, Dub & Ska in der Schweiz\n"
	@printf "  Aufruf: \033[36mmake <ziel>\033[0m   (z. B. make serve PORT=8080)\n"
	@awk 'BEGIN {FS = ":.*?## "} \
	  /^##@ / {printf "\n  \033[1m%s\033[0m\n", substr($$0, 5); next} \
	  /^[a-zA-Z_-]+:.*?## / {printf "  \033[33m%-16s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@printf "\n  Vor jedem Commit: \033[33mmake check\033[0m – muss grün sein.\n\n"

##@ Seite ansehen

serve: ## Seite lokal ansehen (http://localhost:8000, anderer Port: PORT=8080)
	python3 -m http.server $(PORT)

dev: ## Seite lokal mit Auto-Reload (npx live-server, http://127.0.0.1:5500)
	npx --yes live-server@1.2.2 --port=5500 --host=127.0.0.1 --no-browser --wait=200 --ignore=.git,tests

##@ Prüfen

validate: ## Daten prüfen (data/*.json gegen scraper/criteria.md; vergangene Shows erlaubt)
	python3 scripts/validate_shows.py --allow-past

validate-strict: ## Daten streng prüfen (keine vergangenen Shows) – so läuft es im Scraper
	python3 scripts/validate_shows.py

test: ## Unit-Tests für Validator und Formatierer (tests/)
	python3 -m unittest discover -s tests -v

lint: ## Syntaxcheck JS, Python (ruff falls installiert, sonst py_compile), Formatcheck via prettier
	node --check app.js
	@if ruff --version >/dev/null 2>&1; then \
	  ruff check $(PY_DIRS) && ruff format --check $(PY_DIRS); \
	else \
	  echo "ruff nicht installiert (pip install ruff) – nur Syntaxcheck:"; \
	  python3 -m py_compile scripts/*.py tests/*.py && echo "py_compile ok"; \
	fi
	$(PRETTIER) --check $(WEB_FILES)

check: lint validate test ## Alles prüfen – muss vor jedem Commit grün sein
	@python3 scripts/format_data.py --check
	@echo "check ok"

ci: check ## Was GitHub Actions ausführt (.github/workflows/validate.yml) – identisch mit check
	@echo "ci ok"

##@ Formatieren

fmt: ## Code formatieren: prettier (HTML/CSS/JS), ruff (Python, falls installiert), Daten normalisieren
	$(PRETTIER) --write $(WEB_FILES)
	@if ruff --version >/dev/null 2>&1; then ruff format $(PY_DIRS) && ruff check --fix $(PY_DIRS); fi
	$(MAKE) fmt-data

fmt-data: ## data/*.json in kanonische Form bringen (Sortierung, Feldreihenfolge, Einrückung)
	python3 scripts/format_data.py

##@ Scraper & Deploy

scrape: ## Konzerte jetzt scrapen (Claude Code, läuft auf dem Abo)
	claude -p "/scrape-shows" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"

harvest: ## Bands aus Festival-Line-ups vorschlagen (Claude Code)
	claude -p "/harvest-bands" --allowedTools "Bash,Read,Write,Edit,Glob,Grep,WebFetch,WebSearch,Skill"

deploy: check ## Prüfen, geänderte Dateien committen (falls nötig) und main pushen → GitHub Pages deployt
	@test "$$(git branch --show-current)" = main || { echo "deploy nur von main (aktuell: $$(git branch --show-current))"; exit 1; }
	@git diff --quiet && git diff --cached --quiet || git commit -am "Update site"
	git push origin main
	@echo "→ https://$(subst /jahgenda,,$(REPO)).github.io/jahgenda/  (Status: make status)"

cron-install: ## Lokaler Fallback zur Cloud-Routine: Scraper täglich 06:10 auf diesem Mac (launchd)
	mkdir -p ~/Library/Logs/jahgenda ~/Library/LaunchAgents
	sed -e 's#__REPO__#$(CURDIR)#g' -e 's#__HOME__#$(HOME)#g' scripts/launchd/ch.jahgenda.scrape.plist > ~/Library/LaunchAgents/ch.jahgenda.scrape.plist
	launchctl unload ~/Library/LaunchAgents/ch.jahgenda.scrape.plist 2>/dev/null || true
	launchctl load ~/Library/LaunchAgents/ch.jahgenda.scrape.plist
	@echo "installiert: täglich 06:10 → make scrape (Logs in ~/Library/Logs/jahgenda/)"

cron-uninstall: ## Den lokalen launchd-Job wieder entfernen
	launchctl unload ~/Library/LaunchAgents/ch.jahgenda.scrape.plist 2>/dev/null || true
	rm -f ~/Library/LaunchAgents/ch.jahgenda.scrape.plist

status: ## Letzte Deploys (gh) und letzter Scraper-Lauf anzeigen
	@if command -v gh >/dev/null 2>&1; then gh run list -R $(REPO) -L 5; else echo "gh nicht installiert (brew install gh)"; fi
	@python3 -c "import json; r = json.load(open('data/runs.json'))['runs']; \
	  print('Letzter Scraper-Lauf: ' + (r[0]['at'] + ' – ' + str(r[0].get('total', '?')) + ' Shows' if r else 'noch keiner'))"

clean: ## Temporäre Dateien entfernen (__pycache__, .pytest_cache, .ruff_cache)
	find . -name '__pycache__' -type d -prune -exec rm -rf {} + ; rm -rf .pytest_cache .ruff_cache
