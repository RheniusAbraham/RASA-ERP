"""What the customer owes and has paid, line by line.

A contract is billed in lines: each month of the plan ("1", "2", ...) and, when the work ran past its end
date, the extended period ("extension"). Each payment is recorded against one line. A line is settled when
the money paid against it reaches its amount; anything less leaves a balance on that same line (it is never
moved to the next one). Money paid above a line's amount is carried forward as credit to the next line.
"""

from dataclasses import dataclass

EXTENSION_KEY = "extension"
_PAISA = 0.005  # amounts are in rupees and paise: anything under half a paisa is rounding


def round_money(value: float) -> float:
    return round(value + 1e-9, 2)


@dataclass(frozen=True)
class BillingLine:
    key: str
    label: str
    amount: float
    #: Paid against this line directly
    paid: float
    #: Credit carried in from an overpaid earlier line
    credit_in: float
    #: Overpayment on this line carried forward to the next one (or left over, on the last line)
    credit_out: float
    balance: float
    #: "Unpaid", "Part paid", "Paid" or "Overpaid" (money left over after the last line)
    status: str


def billing_lines(lines: list[tuple[str, str, float]], payments: list[tuple[str, float]]) -> list[BillingLine]:
    """`lines` is [(key, label, amount)] in order; `payments` is [(line key, amount)] of the payments that count."""
    paid_by_line: dict[str, float] = {}
    for key, amount in payments:
        paid_by_line[key] = paid_by_line.get(key, 0.0) + amount

    result: list[BillingLine] = []
    credit = 0.0
    for index, (key, label, amount) in enumerate(lines):
        paid = round_money(paid_by_line.get(key, 0.0))
        credit_in = credit
        covered = round_money(paid + credit_in)
        balance = round_money(max(amount - covered, 0.0))
        credit_out = round_money(max(covered - amount, 0.0))
        if covered <= _PAISA:
            status = "Unpaid"
        elif balance > _PAISA:
            status = "Part paid"
        elif credit_out > _PAISA and index == len(lines) - 1:
            status = "Overpaid"
        else:
            status = "Paid"
        result.append(BillingLine(key, label, amount, paid, credit_in, credit_out, balance, status))
        credit = credit_out

    # a payment against a line that no longer exists (for example the extended period after the end date moved)
    # still counts: it is carried as credit on the last line, so no money disappears
    known = {key for key, _, _ in lines}
    stray = round_money(sum(amount for key, amount in paid_by_line.items() if key not in known))
    if stray > _PAISA and result:
        last = result[-1]
        covered = round_money(last.paid + last.credit_in + stray)
        balance = round_money(max(last.amount - covered, 0.0))
        credit_out = round_money(max(covered - last.amount, 0.0))
        status = "Overpaid" if credit_out > _PAISA else ("Part paid" if balance > _PAISA else "Paid")
        result[-1] = BillingLine(last.key, last.label, last.amount, last.paid, last.credit_in + stray, credit_out, balance, status)
    return result
