.PHONY: install run migrate revision test lint format typecheck check smoke loadtest up down logs

install:
	poetry install

run:
	poetry run uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

migrate:
	poetry run alembic upgrade head

revision:
	poetry run alembic revision --autogenerate -m "$(m)"

test:
	poetry run pytest -q

lint:
	poetry run ruff check .

format:
	poetry run ruff format .

typecheck:
	poetry run mypy app

check: lint typecheck test

# End-to-end against a real uvicorn server (SQLite + fakeredis substituted).
smoke:
	poetry run python scripts/smoke.py

# Fan-out regression harness. Throughput figures are host-bound; use
# loadtest/locustfile.py against a real deployment for capacity planning.
loadtest:
	poetry run python scripts/loadtest.py --sockets 250 --notes 8 --readers 40

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f api
