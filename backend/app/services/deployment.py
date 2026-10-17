"""When a dispatched contract becomes Deployed.

The work officially starts on the contract's start date, so a dispatched contract whose start date has
arrived is marked Deployed by the system. The user can also deploy it earlier, in which case the real
start date is today (see the deploy endpoint).
"""

from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.contract import Contract


def today() -> date:
    """Today's date on the server. A function of its own so tests can pretend it is another day."""
    return date.today()


def auto_deploy_due(db: Session) -> int:
    """Marks every dispatched contract whose start date is today or earlier as Deployed. Returns how many."""
    due = db.scalars(select(Contract).where(Contract.status == "Dispatched", Contract.start_date <= today())).all()
    for contract in due:
        contract.status = "Deployed"
        # deployed on the start date, but never before it was dispatched
        started = datetime.combine(contract.start_date, time.min)
        contract.deployed_at = max(started, contract.dispatched_at) if contract.dispatched_at else started
    if due:
        db.commit()
    return len(due)
