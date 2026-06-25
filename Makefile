# ============================================================
# HealthCareOAB+ — one-command operations
# Requires Docker + Docker Compose. Compose file lives in backend/.
# ============================================================
COMPOSE := docker compose -f backend/docker-compose.yml
API_URL := http://localhost:8080

.DEFAULT_GOAL := help
.PHONY: help up down ps logs bootstrap migrate seed smoke test backup restore reset

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'

up: ## Build and start the full stack (api, db, redis, web, observability)
	$(COMPOSE) up -d --build

down: ## Stop the stack (keeps volumes)
	$(COMPOSE) down

ps: ## Show stack status
	$(COMPOSE) ps

logs: ## Tail API logs
	$(COMPOSE) logs -f api

migrate: ## Apply Prisma migrations inside the api container
	$(COMPOSE) exec -T api npm run prisma:deploy

seed: ## Seed demo data inside the api container
	$(COMPOSE) exec -T api npm run db:seed

smoke: ## Run the post-deploy smoke test against the running API
	$(COMPOSE) exec -T api npm run smoke

test: ## Run backend unit tests inside the api container
	$(COMPOSE) exec -T api npm test

bootstrap: ## Full from-scratch boot: start → wait → migrate → seed → smoke
	$(COMPOSE) up -d --build postgres redis api
	@echo "Waiting for API at $(API_URL)/health/live ..."
	@for i in $$(seq 1 60); do \
		if curl -fsS $(API_URL)/health/live >/dev/null 2>&1; then echo "API is up."; break; fi; \
		sleep 2; \
		if [ $$i -eq 60 ]; then echo "API did not become healthy in time."; exit 1; fi; \
	done
	$(MAKE) migrate
	$(MAKE) seed
	$(COMPOSE) up -d --build web prometheus grafana jaeger
	$(MAKE) smoke
	@echo ""
	@echo "Stack ready:"
	@echo "  Frontend   http://localhost:8081"
	@echo "  API        http://localhost:8080"
	@echo "  Grafana    http://localhost:3000"
	@echo "  Prometheus http://localhost:9090"
	@echo "  Jaeger     http://localhost:16686"

backup: ## Dump the database to ./backups/oab-<timestamp>.sql.gz
	@mkdir -p backups
	@STAMP=$$(date -u +%Y%m%dT%H%M%SZ); \
	$(COMPOSE) exec -T postgres pg_dump --no-owner --no-privileges -U oab healthcare_oab \
		| gzip -9 > backups/oab-$$STAMP.sql.gz; \
	echo "Wrote backups/oab-$$STAMP.sql.gz"

restore: ## Restore from a dump: make restore FILE=backups/oab-XXXX.sql.gz
	@test -n "$(FILE)" || { echo "Usage: make restore FILE=backups/oab-<timestamp>.sql.gz"; exit 1; }
	gunzip -c "$(FILE)" | $(COMPOSE) exec -T postgres psql -U oab -d healthcare_oab

reset: ## Tear down everything including volumes (DESTRUCTIVE)
	$(COMPOSE) down -v
