from datetime import date

from app.services.contract_billing import add_months, compute_breakdown, ordinal


def split(start, months, days, cost):
    result = compute_breakdown(start_date=start, months=months, days=days, estimated_cost=cost)
    assert result is not None
    return result


def test_thirty_day_first_month():
    # 36,000 over 1 month 20 days = 720/day
    result = split(date(2026, 4, 1), 1, 20, 36000)
    assert result.daily_rate == 720 and result.basis_days == 50
    first, second = result.periods
    assert (first.label, first.days, first.cost) == ("1st month", 30, 21600)
    assert (second.label, second.days, second.cost) == ("2nd month", 20, 14400)
    assert first.start == date(2026, 4, 1) and first.end == date(2026, 4, 30)
    assert second.start == date(2026, 5, 1) and second.end == date(2026, 5, 20)


def test_thirty_one_day_first_month_is_charged_for_31_days():
    first, second = split(date(2026, 5, 1), 1, 20, 36000).periods
    assert (first.days, first.cost) == (31, 22320)
    assert second.cost == 14400


def test_month_end_start_dates_clamp():
    # 31 Jan + 1 month -> 28 Feb (2026 is not a leap year)
    first, second = split(date(2026, 1, 31), 2, 0, 60000).periods
    assert first.end == date(2026, 2, 27) and first.days == 28
    assert second.start == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)  # leap year


def test_days_only_has_one_period():
    (only,) = split(date(2026, 4, 1), 0, 10, 7200).periods
    assert (only.label, only.days, only.cost) == ("10 days", 10, 7200)


def test_months_only_has_no_leftover_period():
    assert len(split(date(2026, 4, 1), 3, 0, 90000).periods) == 3


def test_no_duration_means_no_breakdown():
    assert compute_breakdown(start_date=date(2026, 4, 1), months=0, days=0, estimated_cost=100) is None


def test_ordinals():
    assert [ordinal(n) for n in (1, 2, 3, 4, 11, 12, 13, 21, 22, 101)] == [
        "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "101st",
    ]
