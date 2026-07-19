"""Locust load profile for a real Founder Wall deployment.

`scripts/loadtest.py` validates fan-out correctness in-process. This file is
for capacity planning against a deployed stack (Linux + Postgres + Redis),
where the numbers are meaningful.

    pip install locust
    locust -f loadtest/locustfile.py --host https://api.founderwall.example

Traffic shape mirrors reality: the wall is overwhelmingly read/watch traffic
with a thin write path — most visitors look, few post.

Set FOUNDER_WALL_TOKEN to exercise authenticated writes:

    export FOUNDER_WALL_TOKEN="<access token>"
"""

from __future__ import annotations

import os
import random

from locust import HttpUser, between, events, task

_TOKEN = os.environ.get("FOUNDER_WALL_TOKEN", "")


@events.test_start.add_listener
def _announce(environment, **_kwargs) -> None:
    if not _TOKEN:
        print(
            "FOUNDER_WALL_TOKEN unset — running read-only. "
            "Writes exercise the placement/uniqueness path; set it to include them."
        )


class WallViewer(HttpUser):
    """The common case: someone watching the monument."""

    weight = 20
    wait_time = between(1, 5)

    def on_start(self) -> None:
        # Every viewer pulls the manifest once, then polls tiles like the UI.
        with self.client.get("/wall/manifest", catch_response=True) as response:
            if response.status_code != 200:
                response.failure(f"manifest unavailable: {response.status_code}")
                self.total_tiles = 1
                return
            self.total_tiles = max(int(response.json().get("total_tiles", 1)), 1)

    @task(10)
    def read_tile(self) -> None:
        tile_id = random.randrange(self.total_tiles)
        self.client.get(f"/wall/tiles/{tile_id}", name="/wall/tiles/[id]")

    @task(5)
    def read_stats(self) -> None:
        self.client.get("/stats")

    @task(1)
    def read_manifest(self) -> None:
        self.client.get("/wall/manifest")


class WallFounder(HttpUser):
    """The rare case: an authenticated founder posting a thought."""

    weight = 1
    wait_time = between(5, 20)

    def on_start(self) -> None:
        self.headers = {"Authorization": f"Bearer {_TOKEN}"} if _TOKEN else {}

    @task(3)
    def whoami(self) -> None:
        if not _TOKEN:
            return
        self.client.get("/auth/me", headers=self.headers, name="/auth/me")

    @task(1)
    def post_note(self) -> None:
        if not _TOKEN:
            return
        # A founder already holding an active note gets a 409 by design; that
        # is expected traffic, not an error.
        with self.client.post(
            "/wall/notes",
            json={"content": f"load test thought {random.randrange(1_000_000)}"},
            headers=self.headers,
            name="/wall/notes",
            catch_response=True,
        ) as response:
            if response.status_code in (201, 409):
                response.success()
            else:
                response.failure(f"unexpected status: {response.status_code}")


class HealthProbe(HttpUser):
    """Mimics the load balancer's liveness polling."""

    weight = 1
    wait_time = between(5, 10)

    @task
    def live(self) -> None:
        self.client.get("/health/live")
