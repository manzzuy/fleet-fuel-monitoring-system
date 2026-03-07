PNPM=pnpm
DOCKER_COMPOSE=docker compose -f infra/docker/docker-compose.yml
PSQL_EXISTS=psql -lqt | cut -d '|' -f 1 | tr -d ' ' | grep -qx

.PHONY: up down dev api web pwa test db-create db-migrate db-drop deploy-build deploy-migrate deploy-api

up:
	$(DOCKER_COMPOSE) up -d

down:
	$(DOCKER_COMPOSE) down

dev:
	$(PNPM) dev

api:
	$(PNPM) --filter @fleet-fuel/api dev

web:
	$(PNPM) --filter @fleet-fuel/admin-web dev

pwa:
	$(PNPM) --filter @fleet-fuel/driver-pwa dev

test:
	$(PNPM) -C apps/api test

db-create:
	@($(PSQL_EXISTS) fleet_fuel_platform_dev) || createdb fleet_fuel_platform_dev

db-migrate:
	cd apps/api && pnpm prisma migrate deploy

db-drop:
	@echo "WARNING: this drops the disposable local development database fleet_fuel_platform_dev."
	@echo "This must never be used against shared or important databases."
	dropdb fleet_fuel_platform_dev

deploy-build:
	$(PNPM) deploy:build

deploy-migrate:
	$(PNPM) deploy:migrate

deploy-api:
	$(PNPM) deploy:boot:api
