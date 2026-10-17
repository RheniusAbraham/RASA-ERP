"""Month-by-month split of a contract's estimated cost.

Python port of frontend/src/lib/contract-billing.ts, so the numbers the form previews and the
numbers the API returns are the same.

The daily rate is the estimated cost spread over a 30-day-month basis (months x 30 + extra days).
Each full contract month is charged for its real number of days (28-31); the leftover days are
charged as they are.

Example: 36,000 for 1 month 20 days -> 720/day (36,000 / 50). A 30-day first month is 21,600,
a 31-day first month is 22,320, and the remaining 20 days are 14,400.
"""

import calendar
import math
from dataclasses import dataclass
from datetime import date, timedelta


@dataclass(frozen=True)
class BillingPeriod:
    label: str  # "1st month", or "20 days" when the contract is shorter than a month
    start: date
    end: date  # inclusive
    days: int
    cost: float


@dataclass(frozen=True)
class Breakdown:
    daily_rate: float
    basis_days: int
    periods: list[BillingPeriod]


def ordinal(n: int) -> str:
    if 11 <= n % 100 <= 13:
        return f"{n}th"
    return f"{n}{({1: 'st', 2: 'nd', 3: 'rd'}).get(n % 10, 'th')}"


def add_months(d: date, n: int) -> date:
    """Adds calendar months, clamping to the last day (31 Jan + 1 month = 28/29 Feb)."""
    index = d.month - 1 + n
    year, month = d.year + index // 12, index % 12 + 1
    return date(year, month, min(d.day, calendar.monthrange(year, month)[1]))


def _round2(value: float) -> float:
    return math.floor(value * 100 + 0.5) / 100  # round half up, same as JavaScript's Math.round


def compute_breakdown(*, start_date: date, months: int, days: int, estimated_cost: float) -> Breakdown | None:
    basis_days = months * 30 + days
    if basis_days <= 0 or estimated_cost < 0:
        return None

    daily_rate = estimated_cost / basis_days
    periods: list[BillingPeriod] = []

    for i in range(months):
        start = add_months(start_date, i)
        next_start = add_months(start_date, i + 1)
        billed = (next_start - start).days
        periods.append(
            BillingPeriod(
                label=f"{ordinal(i + 1)} month",
                start=start,
                end=next_start - timedelta(days=1),
                days=billed,
                cost=_round2(daily_rate * billed),
            )
        )

    if days > 0:
        start = add_months(start_date, months)
        periods.append(
            BillingPeriod(
                label=f"{days} day{'' if days == 1 else 's'}" if months == 0 else f"{ordinal(months + 1)} month",
                start=start,
                end=start + timedelta(days=days - 1),
                days=days,
                cost=_round2(daily_rate * days),
            )
        )

    return Breakdown(daily_rate=_round2(daily_rate), basis_days=basis_days, periods=periods)


def contract_end_date(start_date: date, months: int, days: int) -> date:
    """The last day of a contract, counting the start date as day 1 (1 Nov + 1 month = 30 Nov, 1 Nov + 20 days = 20 Nov).

    The reverse of the frontend's period-from-end-date: whole months first, then the leftover days.
    """
    after_months = add_months(start_date, months)
    return after_months + timedelta(days=days - 1)


def round_money(value: float) -> float:
    """Rounds rupees to paise the same way every figure in the app is rounded."""
    return _round2(value)


#: How many days past the end date (or past the last confirmation) the extension is charged without being confirmed
EXTENSION_GRACE_DAYS = 7


@dataclass(frozen=True)
class Extension:
    days: int
    start: date | None  # first extra day
    end: date | None  # last extra day so far
    amount: float


def compute_extension(*, end_date: date, until: date, daily_cost: float) -> Extension:
    """The days a contract has run past its end date, up to `until` (inclusive), charged at the cost for a day."""
    days = max((until - end_date).days, 0)
    if days == 0:
        return Extension(days=0, start=None, end=None, amount=0.0)
    return Extension(days=days, start=end_date + timedelta(days=1), end=until, amount=round_money(days * daily_cost))
