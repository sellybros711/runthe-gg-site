"""
The last season the pool runs to, from one rule instead of a year typed in two
scripts.

A season belongs in the pool once its World Series is over, which is always by
the first of November. So from November 1 the newest season is this year's, and
before it last year's: a refresh run in July never ships a half season.
POOL_LAST_SEASON in the environment pins it (a rebuild of an older pool, or a
test).

It was `2025` in build_positions.py and fetch_inputs.py. A refresh after the
2026 World Series would have dropped 2026 silently and gone green, because
pool_shape.py compares the rebuilt pool with the one that ships and both ended
in 2025.
"""
import datetime, os


def last_completed_season(today=None):
    pinned = os.environ.get("POOL_LAST_SEASON")
    if pinned:
        return int(pinned)
    today = today or datetime.date.today()
    return today.year if today.month >= 11 else today.year - 1


if __name__ == "__main__":
    print(last_completed_season())
