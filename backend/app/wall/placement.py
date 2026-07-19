"""Wall geometry: mapping cells to tiles and finding free placements."""

from __future__ import annotations

from dataclasses import dataclass

from app.shared.config import Settings
from app.shared.exceptions import ConflictError


@dataclass(frozen=True, slots=True)
class Cell:
    x: int
    y: int


@dataclass(frozen=True, slots=True)
class TileBounds:
    tile_id: int
    col: int
    row: int
    x0: int
    y0: int
    x1: int  # exclusive
    y1: int  # exclusive


class WallGeometry:
    """Pure geometry over the fixed wall grid — no I/O."""

    def __init__(self, settings: Settings) -> None:
        self.columns = settings.wall_columns
        self.rows = settings.wall_rows
        self.tile_size = settings.tile_size
        self.tiles_across = settings.tiles_across
        self.tiles_down = settings.tiles_down

    @property
    def total_cells(self) -> int:
        return self.columns * self.rows

    @property
    def total_tiles(self) -> int:
        return self.tiles_across * self.tiles_down

    def tile_for(self, x: int, y: int) -> int:
        col_block = x // self.tile_size
        row_block = y // self.tile_size
        return row_block * self.tiles_across + col_block

    def tile_bounds(self, tile_id: int) -> TileBounds:
        if not 0 <= tile_id < self.total_tiles:
            raise ConflictError(f"Tile {tile_id} is out of range")
        col = tile_id % self.tiles_across
        row = tile_id // self.tiles_across
        x0 = col * self.tile_size
        y0 = row * self.tile_size
        return TileBounds(
            tile_id=tile_id,
            col=col,
            row=row,
            x0=x0,
            y0=y0,
            x1=min(x0 + self.tile_size, self.columns),
            y1=min(y0 + self.tile_size, self.rows),
        )

    def first_free_cell(self, occupied: set[tuple[int, int]]) -> Cell:
        """Return the first free cell in row-major order.

        Placement spirals outward from the centre so the wall fills in a
        visually pleasing, dense cluster rather than a top-left stripe.
        """
        for x, y in self._spiral_order():
            if (x, y) not in occupied:
                return Cell(x=x, y=y)
        raise ConflictError("The wall is full")

    def _spiral_order(self) -> list[tuple[int, int]]:
        cx, cy = self.columns // 2, self.rows // 2
        cells = [(x, y) for y in range(self.rows) for x in range(self.columns)]
        cells.sort(key=lambda c: (abs(c[0] - cx) + abs(c[1] - cy), c[1], c[0]))
        return cells
