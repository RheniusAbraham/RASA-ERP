from datetime import date

from tests.conftest import NOT_A_REAL_FILE, PDF_BYTES, PNG_BYTES

API = "/api/v1"


def make_customer(client, name="Acme Builders"):
    return client.post(f"{API}/customers", json={"name": name, "phone": "9000000000"}).json()


def make_material(client, name="M-Sand", owned=100, quantity_unit="pcs"):
    return client.post(
        f"{API}/materials",
        json={
            "name": name,
            "totalQuantityOwned": owned,
            "quantityUnit": quantity_unit,
            "structuralDescription": "fine",
        },
    ).json()


def lines(*pairs):
    """lines((sand, 40), (bricks, 5, 750)) -> the `materials` part of a contract request.
    """
    return [
        {"materialId": p[0]["id"], "quantity": p[1]}
        for p in pairs
    ]


def contract_payload(customer_id, materials, **overrides):
    return {
        "customerId": customer_id,
        "siteAddress": "Plot 4, Salvation Road",
        "materials": materials,
        "startDate": "2026-05-01",
        "months": 1,
        "days": 20,
        "transportationCost": 6000,
        "materialsCost": 30000,
        "estimatedCost": 36000,
        **overrides,
    }


def test_create_contract_returns_customer_materials_and_breakdown(client):
    customer = make_customer(client)
    sand = make_material(client, owned=1200, quantity_unit="sq ft")
    bricks = make_material(client, "Bricks", owned=4000)
    response = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 300), (bricks, 2500))))
    assert response.status_code == 201, response.text
    contract = response.json()

    assert contract["customerName"] == "Acme Builders"
    first_line, second_line = contract["materials"]
    assert first_line == {
        "materialId": sand["id"], "name": "M-Sand", "quantity": 300, "quantityUnit": "sq ft",
        "dispatchedQuantity": None, "retrievedIntact": None, "retrievedDamaged": None, "returnDestination": None, "returnSiteNote": None, "sources": [],
    }
    assert second_line["name"] == "Bricks" and second_line["quantity"] == 2500 and "rate" not in second_line

    assert contract["dailyCost"] == 720 and contract["finalDailyCost"] is None
    first, second = contract["breakdown"]
    assert first == {"label": "1st month", "from": "2026-05-01", "to": "2026-05-31", "days": 31, "cost": 22320}
    assert second["label"] == "2nd month" and second["days"] == 20 and second["cost"] == 14400


def test_contract_needs_existing_customer_and_materials(client):
    customer, sand = make_customer(client), make_material(client)
    assert client.post(f"{API}/contracts", json=contract_payload(999, lines((sand, 1)))).status_code == 404
    unknown = lines((sand, 1)) + [{"materialId": 999, "quantity": 1}]
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], unknown)).status_code == 404


def test_contract_validation(client):
    customer, sand = make_customer(client), make_material(client)
    ok = contract_payload(customer["id"], lines((sand, 10)))
    assert client.post(f"{API}/contracts", json={**ok, "months": 0, "days": 0}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materials": []}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materials": lines((sand, 1), (sand, 2))}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materials": lines((sand, 0))}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materials": lines((sand, -5))}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materials": [{"materialId": sand["id"]}]}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "estimatedCost": -1}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "days": 31}).status_code == 422
    # the old shape (a list of ids) is gone
    old = {k: v for k, v in ok.items() if k != "materials"}
    assert client.post(f"{API}/contracts", json={**old, "materialIds": [sand["id"]]}).status_code == 422


def test_cannot_send_more_than_is_owned(client):
    customer = make_customer(client)
    sand = make_material(client, owned=100, quantity_unit="pcs")
    over = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 101))))
    assert over.status_code == 422
    assert "Only 100 pcs of M-Sand are available" in over.json()["detail"]
    assert client.get(f"{API}/contracts").json() == []  # nothing was created

    exactly = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 100))))
    assert exactly.status_code == 201  # all of it is allowed


def test_editing_a_contract_changes_quantities_and_materials(client):
    customer = make_customer(client)
    sand, bricks, tiles = make_material(client), make_material(client, "Bricks"), make_material(client, "Tiles")
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 10), (bricks, 20)))).json()

    # sand quantity 10 -> 30, bricks dropped, tiles added
    updated = client.put(f"{API}/contracts/{contract['id']}", json=contract_payload(
        customer["id"], lines((sand, 30), (tiles, 4)), months=2, days=0, estimatedCost=60000))
    assert updated.status_code == 200, updated.text
    by_name = {m["name"]: m for m in updated.json()["materials"]}
    assert set(by_name) == {"M-Sand", "Tiles"}
    assert by_name["M-Sand"]["quantity"] == 30
    assert len(updated.json()["breakdown"]) == 2


def test_a_refused_edit_changes_nothing(client):
    customer, sand = make_customer(client), make_material(client, owned=100)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 10)))).json()
    refused = client.put(f"{API}/contracts/{contract['id']}", json=contract_payload(
        customer["id"], lines((sand, 500)), siteAddress="Somewhere else"))
    assert refused.status_code == 422
    after = client.get(f"{API}/contracts/{contract['id']}").json()
    assert after["materials"][0]["quantity"] == 10 and after["siteAddress"] == "Plot 4, Salvation Road"


def test_list_filter_update_delete(client):
    a, b, sand = make_customer(client), make_customer(client, "Second Co"), make_material(client)
    first = client.post(f"{API}/contracts", json=contract_payload(a["id"], lines((sand, 5)))).json()
    client.post(f"{API}/contracts", json=contract_payload(b["id"], lines((sand, 5))))

    assert len(client.get(f"{API}/contracts").json()) == 2
    only_a = client.get(f"{API}/contracts", params={"customer_id": a["id"]}).json()
    assert [c["id"] for c in only_a] == [first["id"]]

    updated = client.put(f"{API}/contracts/{first['id']}", json=contract_payload(a["id"], lines((sand, 5)), months=2, days=0, estimatedCost=60000))
    assert updated.status_code == 200 and len(updated.json()["breakdown"]) == 2

    assert client.delete(f"{API}/contracts/{first['id']}").status_code == 204
    assert client.get(f"{API}/contracts/{first['id']}").status_code == 404


def test_customer_and_material_in_use_cannot_be_deleted(client):
    customer, sand, spare = make_customer(client), make_material(client), make_material(client, "Spare")
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 5)))).json()

    assert client.delete(f"{API}/customers/{customer['id']}").status_code == 409
    assert client.delete(f"{API}/materials/{sand['id']}").status_code == 409
    assert client.delete(f"{API}/materials/{spare['id']}").status_code == 204  # unused material is fine

    client.delete(f"{API}/contracts/{contract['id']}")
    assert client.delete(f"{API}/customers/{customer['id']}").status_code == 204
    assert client.delete(f"{API}/materials/{sand['id']}").status_code == 204


def dispatch_payload(*pairs, final_cost=36000, final_transport=6500, loading=500):
    return {
        "materials": [{"materialId": m["id"], "quantity": q, "sources": [{"lotId": None, "quantity": q}] if q else []} for m, q in pairs],
        "finalTransportationCost": final_transport,
        "finalCost": final_cost,
        "loadingCharges": loading,
    }


def test_a_contract_is_dispatched_once_with_the_real_quantities(client):
    customer, sand = make_customer(client), make_material(client, owned=100)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 40)))).json()
    assert contract["status"] == "Estimated" and contract["dispatchedAt"] is None
    assert contract["finalCost"] is None and contract["finalTransportationCost"] is None and contract["materials"][0]["dispatchedQuantity"] is None

    url = f"{API}/contracts/{contract['id']}/dispatch"
    done = client.post(url, json=dispatch_payload((sand, 35), final_cost=40000, final_transport=7200.5, loading=750.5))
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "Dispatched" and body["dispatchedAt"] is not None
    assert body["materials"][0]["quantity"] == 40 and body["materials"][0]["dispatchedQuantity"] == 35
    assert body["finalCost"] == 40000 and body["loadingCharges"] == 750.5
    assert body["finalTransportationCost"] == 7200.5
    assert sum(p["cost"] for p in body["finalBreakdown"]) > 39000  # split of the final cost, not the estimate

    assert client.post(url, json=dispatch_payload((sand, 35))).status_code == 409
    assert client.post(f"{API}/contracts/999/dispatch", json=dispatch_payload((sand, 1))).status_code == 404

    # editing a dispatched contract keeps it dispatched
    edited = client.put(f"{API}/contracts/{contract['id']}", json=contract_payload(customer["id"], lines((sand, 41))))
    assert edited.json()["status"] == "Dispatched"


def test_dispatch_validation_and_stock(client):
    customer = make_customer(client)
    sand, bricks = make_material(client, owned=100), make_material(client, "Bricks", owned=100)
    other = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 70)))).json()
    mine = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 20), (bricks, 5)))).json()
    url = f"{API}/contracts/{mine['id']}/dispatch"

    assert client.post(url, json=dispatch_payload((sand, 20))).status_code == 422  # a material is missing
    assert client.post(url, json=dispatch_payload((sand, 20), (bricks, 5), (sand, 1))).status_code == 422  # twice
    assert client.post(url, json=dispatch_payload((sand, -1), (bricks, 5))).status_code == 422
    assert client.post(url, json=dispatch_payload((sand, 20), (bricks, 5), final_cost=-1)).status_code == 422
    assert client.post(url, json={"materials": [], "finalCost": 1, "loadingCharges": 0}).status_code == 422
    assert client.post(url, json=dispatch_payload((sand, 20), (bricks, 5), final_transport=-1)).status_code == 422
    no_transport = {k: v for k, v in dispatch_payload((sand, 20), (bricks, 5)).items() if k != "finalTransportationCost"}
    assert client.post(url, json=no_transport).status_code == 422
    over = client.post(url, json=dispatch_payload((sand, 31), (bricks, 5)))  # only 30 are left after the other contract
    assert over.status_code == 422 and "only 30 pcs are in the yard" in over.json()["detail"]
    assert client.get(f"{API}/contracts/{mine['id']}").json()["status"] == "Estimated"  # nothing changed

    ok = client.post(url, json=dispatch_payload((sand, 0), (bricks, 5), loading=0))  # none of one material is allowed
    assert ok.status_code == 200
    # the unsent sand is free again for others
    assert client.put(f"{API}/contracts/{other['id']}", json=contract_payload(customer["id"], lines((sand, 95)))).status_code == 200


def test_stock_taken_by_other_contracts_is_not_available_again(client):
    customer = make_customer(client)
    pipes = make_material(client, "Pipes", owned=100)
    first = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 39)))).json()

    # 61 left: asking for 62 is refused, 61 is fine
    refused = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 62))))
    assert refused.status_code == 422 and "Only 61 pcs of Pipes are available" in refused.json()["detail"]
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 61)))).status_code == 201

    # editing the first contract may keep its own 39 (nothing left for more, though)
    assert client.put(f"{API}/contracts/{first['id']}", json=contract_payload(customer["id"], lines((pipes, 39)))).status_code == 200
    assert client.put(f"{API}/contracts/{first['id']}", json=contract_payload(customer["id"], lines((pipes, 40)))).status_code == 422

    # deleting a contract gives its stock back
    client.delete(f"{API}/contracts/{first['id']}")
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 39)))).status_code == 201


def test_a_contract_can_carry_notes_about_the_estimate(client):
    customer, sand = make_customer(client), make_material(client)
    plain = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 5)))).json()
    assert plain["description"] == ""  # optional

    note = "  Customer wants delivery before the monsoon.  "
    made = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 5)), description=note)).json()
    assert made["description"] == "Customer wants delivery before the monsoon."

    edited = client.put(f"{API}/contracts/{made['id']}", json=contract_payload(customer["id"], lines((sand, 5)), description="Revised"))
    assert edited.json()["description"] == "Revised"
    too_long = contract_payload(customer["id"], lines((sand, 5)), description="x" * 2001)
    assert client.post(f"{API}/contracts", json=too_long).status_code == 422


def dispatched_contract(client, **overrides):
    customer, sand = make_customer(client), make_material(client, owned=100)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 10)), **overrides)).json()
    client.post(f"{API}/contracts/{contract['id']}/dispatch", json=dispatch_payload((sand, 10)))
    return customer, sand, contract


def test_only_a_dispatched_contract_can_be_deployed(client):
    customer, sand = make_customer(client), make_material(client, owned=100)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 10)))).json()
    deploy = f"{API}/contracts/{contract['id']}/deploy"

    early = client.post(deploy)
    assert early.status_code == 409 and "Dispatch the contract" in early.json()["detail"]
    assert client.get(f"{API}/contracts/{contract['id']}").json()["status"] == "Estimated"

    client.post(f"{API}/contracts/{contract['id']}/dispatch", json=dispatch_payload((sand, 10)))
    done = client.post(deploy, json={"confirmEarlyStart": True})
    assert done.status_code == 200
    assert done.json()["status"] == "Deployed" and done.json()["deployedAt"] is not None
    assert done.json()["dispatchedAt"] is not None  # the earlier phase is kept

    assert client.post(deploy).status_code == 409
    assert client.post(f"{API}/contracts/{contract['id']}/dispatch", json=dispatch_payload((sand, 10))).status_code == 409
    assert client.post(f"{API}/contracts/999/deploy").status_code == 404


def test_deploying_early_needs_confirmation_and_moves_the_dates(client):
    # planned: 1 May 2026 for 1 month 20 days (ends 20 Jun); "today" is 1 April 2026
    _, _, contract = dispatched_contract(client)
    assert (contract["startDate"], contract["endDate"], contract["plannedStartDate"]) == ("2026-05-01", "2026-06-20", None)
    deploy = f"{API}/contracts/{contract['id']}/deploy"

    # without confirmation nothing changes
    refused = client.post(deploy)
    assert refused.status_code == 409 and "2026-05-01" in refused.json()["detail"]
    assert client.post(deploy, json={"confirmEarlyStart": False}).status_code == 409
    still = client.get(f"{API}/contracts/{contract['id']}").json()
    assert still["status"] == "Dispatched" and still["startDate"] == "2026-05-01"

    done = client.post(deploy, json={"confirmEarlyStart": True}).json()
    assert done["status"] == "Deployed"
    assert done["startDate"] == "2026-04-01" and done["plannedStartDate"] == "2026-05-01"
    assert done["endDate"] == "2026-05-20"  # 1 Apr + 1 month 20 days
    # what we charge by, the cost for a day, does not change; the month-by-month split follows the new dates
    assert done["dailyCost"] == still["dailyCost"] and done["finalDailyCost"] == still["finalDailyCost"] is not None
    assert [p["from"] for p in done["breakdown"]] == ["2026-04-01", "2026-05-01"]
    assert [p["from"] for p in done["finalBreakdown"]] == ["2026-04-01", "2026-05-01"]
    assert done["estimatedCost"] == still["estimatedCost"] and done["finalCost"] == still["finalCost"]


def test_a_dispatched_contract_is_deployed_when_its_start_date_arrives(client, monkeypatch):
    _, _, contract = dispatched_contract(client)
    assert client.get(f"{API}/contracts/{contract['id']}").json()["status"] == "Dispatched"

    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 4, 30))
    assert client.get(f"{API}/contracts/{contract['id']}").json()["status"] == "Dispatched"  # the day before

    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 1))
    listed = client.get(f"{API}/contracts").json()[0]
    assert listed["status"] == "Deployed" and listed["deployedAt"] is not None
    assert listed["startDate"] == "2026-05-01" and listed["plannedStartDate"] is None  # on time: no dates move

    # an estimated (never dispatched) contract is not deployed by the date alone
    customer, sand = make_customer(client, "Other"), make_material(client, "Other sand", owned=100)
    estimated = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 1)))).json()
    assert client.get(f"{API}/contracts/{estimated['id']}").json()["status"] == "Estimated"


def test_dispatching_a_contract_already_past_its_start_date_deploys_it(client, monkeypatch):
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 10))
    _, _, contract = dispatched_contract(client)
    done = client.get(f"{API}/contracts/{contract['id']}").json()
    assert done["status"] == "Deployed" and done["startDate"] == "2026-05-01"


def test_the_start_date_of_a_deployed_contract_is_locked(client):
    customer, sand, contract = dispatched_contract(client)
    client.post(f"{API}/contracts/{contract['id']}/deploy", json={"confirmEarlyStart": True})  # now starts 1 Apr 2026
    url = f"{API}/contracts/{contract['id']}"

    moved = client.put(url, json=contract_payload(customer["id"], lines((sand, 10)), startDate="2026-06-01"))
    assert moved.status_code == 422 and "start date" in moved.json()["detail"]

    # the same start date is fine, and so is a longer period (extending the work)
    same = contract_payload(customer["id"], lines((sand, 10)), startDate="2026-04-01", months=3, days=0)
    extended = client.put(url, json=same)
    assert extended.status_code == 200 and extended.json()["endDate"] == "2026-06-30"
    assert extended.json()["plannedStartDate"] == "2026-05-01"


def test_material_distribution_shows_who_has_the_stock(client):
    a, b = make_customer(client, "Alpha Co"), make_customer(client, "Beta Co")
    pipes, spare = make_material(client, "Pipes", owned=100), make_material(client, "Spare", owned=10)
    assert client.get(f"{API}/materials/{pipes['id']}/distribution").json() == {
        "totalOwned": 100, "inUse": 0, "available": 100, "elsewhere": 0, "damaged": 0, "lost": 0,
        "quantityUnit": "pcs", "contracts": [], "lots": [], "movements": [],
    }

    first = client.post(f"{API}/contracts", json=contract_payload(a["id"], lines((pipes, 39)), siteAddress="Site A")).json()
    client.post(f"{API}/contracts", json=contract_payload(b["id"], lines((pipes, 20), (spare, 3)), siteAddress="Site B"))
    body = client.get(f"{API}/materials/{pipes['id']}/distribution").json()
    assert (body["inUse"], body["available"]) == (59, 41)
    assert [(c["customerName"], c["siteAddress"], c["quantity"], c["status"]) for c in body["contracts"]] == [
        ("Alpha Co", "Site A", 39, "Estimated"), ("Beta Co", "Site B", 20, "Estimated"),
    ]

    # dispatching changes what counts: the 54 really sent, not the 39 planned
    client.post(f"{API}/contracts/{first['id']}/dispatch", json=dispatch_payload((pipes, 54)))
    body = client.get(f"{API}/materials/{pipes['id']}/distribution").json()
    assert (body["inUse"], body["available"]) == (74, 26)
    line = body["contracts"][0]
    assert (line["plannedQuantity"], line["dispatchedQuantity"], line["quantity"], line["status"]) == (39, 54, 54, "Dispatched")

    # a deleted contract gives its stock back; an unknown material is a 404
    client.delete(f"{API}/contracts/{first['id']}")
    assert client.get(f"{API}/materials/{pipes['id']}/distribution").json()["inUse"] == 20
    assert client.get(f"{API}/materials/999/distribution").status_code == 404


def test_material_distribution_includes_each_contracts_dates(client):
    customer, pipes = make_customer(client), make_material(client, "Pipes")
    # 1 month 20 days from 1 May 2026: ends 20 Jun 2026
    client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 5))))
    row = client.get(f"{API}/materials/{pipes['id']}/distribution").json()["contracts"][0]
    assert row["startDate"] == "2026-05-01" and row["endDate"] == "2026-06-20"
    assert row["dispatchedAt"] is None


def test_the_cost_for_a_day_is_stored_and_follows_the_contract(client):
    customer, sand = make_customer(client), make_material(client, owned=100)
    # 36,000 over 1 month 20 days = 720 a day
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 10)))).json()
    assert contract["dailyCost"] == 720
    assert client.get(f"{API}/contracts/{contract['id']}").json()["dailyCost"] == 720

    # changing the cost or the period changes it
    edited = client.put(f"{API}/contracts/{contract['id']}", json=contract_payload(
        customer["id"], lines((sand, 10)), estimatedCost=30000, months=1, days=0))
    assert edited.json()["dailyCost"] == 1000

    # dispatching stores the same figure for the updated final cost, and a later edit keeps it in step
    done = client.post(f"{API}/contracts/{contract['id']}/dispatch", json=dispatch_payload((sand, 10), final_cost=45000))
    assert done.json()["dailyCost"] == 1000 and done.json()["finalDailyCost"] == 1500
    later = client.put(f"{API}/contracts/{contract['id']}", json=contract_payload(
        customer["id"], lines((sand, 10)), estimatedCost=30000, months=3, days=0))
    assert later.json()["dailyCost"] == 333.33 and later.json()["finalDailyCost"] == 500


def test_the_end_date_is_stored_and_follows_the_start_and_period(client):
    customer, sand = make_customer(client), make_material(client, owned=100)
    # starts 1 May 2026 for 1 month 20 days: 1 Jun + 19 days = 20 Jun
    made = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 5)))).json()
    assert made["endDate"] == "2026-06-20"
    assert client.get(f"{API}/contracts/{made['id']}").json()["endDate"] == "2026-06-20"

    cases = [
        ("2026-05-01", 0, 1, "2026-05-01"),  # one day ends the day it starts
        ("2026-05-01", 1, 0, "2026-05-31"),
        ("2026-01-31", 1, 0, "2026-02-27"),  # 31 Jan + 1 month clamps to 28 Feb, so the last day is 27 Feb
        ("2026-12-15", 2, 3, "2027-02-17"),
    ]
    for start, months, days, end in cases:
        body = contract_payload(customer["id"], lines((sand, 5)), startDate=start, months=months, days=days)
        updated = client.put(f"{API}/contracts/{made['id']}", json=body)
        assert updated.json()["endDate"] == end, (start, months, days)

    # the stock distribution reads the same stored date
    row = client.get(f"{API}/materials/{sand['id']}/distribution").json()["contracts"][0]
    assert row["endDate"] == "2027-02-17"


def test_only_a_deployed_contract_can_be_concluded(client):
    customer, sand, contract = dispatched_contract(client)
    conclude = f"{API}/contracts/{contract['id']}/conclude"

    # dispatched but not deployed yet
    early = client.post(conclude, json=back(client, f"{API}/contracts/{contract['id']}"))
    assert early.status_code == 409 and "Deploy the contract" in early.json()["detail"]

    client.post(f"{API}/contracts/{contract['id']}/deploy", json={"confirmEarlyStart": True})
    done = client.post(conclude, json=back(client, f"{API}/contracts/{contract['id']}"))
    assert done.status_code == 200
    body = done.json()
    assert body["status"] == "Concluded" and body["concludedAt"] is not None
    assert body["deployedAt"] is not None and body["dispatchedAt"] is not None  # the earlier phases are kept

    assert client.post(conclude, json=back(client, f"{API}/contracts/{contract['id']}")).status_code == 409  # only once
    assert client.post(f"{API}/contracts/{contract['id']}/deploy", json={"confirmEarlyStart": True}).status_code == 409
    assert client.post(f"{API}/contracts/999/conclude", json={"materials": [{"materialId": 1, "intact": 0, "damaged": 0}]}).status_code == 404

    # a concluded contract keeps its start date locked, like a deployed one
    moved = client.put(f"{API}/contracts/{contract['id']}", json=contract_payload(customer["id"], lines((sand, 10)), startDate="2026-06-01"))
    assert moved.status_code == 422

    estimated = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 1)))).json()
    assert client.post(f"{API}/contracts/{estimated['id']}/conclude", json={"materials": [{"materialId": sand["id"], "intact": 0, "damaged": 0}]}).status_code == 409


def back(client, url, intact=None, damaged=0, **extra):
    """A conclude request body: every material came back in good condition (or as given), plus any extra fields."""
    materials = client.get(url).json()["materials"]
    return {
        "materials": [
            {
                "materialId": m["materialId"],
                "intact": (m["dispatchedQuantity"] if intact is None else intact),
                "damaged": damaged,
                "destination": "Back to Yard",
            }
            for m in materials
        ],
        **extra,
    }


def deployed_on_its_start(client, monkeypatch):
    """A contract deployed on 1 May 2026 for 1 month 20 days (ends 20 Jun); 36,000 final cost = 720 a day."""
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 1))
    customer, sand, contract = dispatched_contract(client)
    return customer, sand, f"{API}/contracts/{contract['id']}"


def at(client, monkeypatch, url, day):
    monkeypatch.setattr("app.services.deployment.today", lambda: day)
    return client.get(url).json()


def test_days_past_the_end_date_are_an_extension_charged_by_the_day(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)

    on_time = at(client, monkeypatch, url, date(2026, 6, 20))  # the last day: not extended yet
    assert on_time["status"] == "Deployed" and on_time["extendedDays"] == 0 and on_time["extensionAmount"] == 0
    assert on_time["extensionStart"] is None and on_time["extensionElapsedDays"] == 0 and not on_time["extensionPaused"]

    three = at(client, monkeypatch, url, date(2026, 6, 23))
    assert three["extendedDays"] == 3 and three["extensionStart"] == "2026-06-21" and three["extensionEnd"] == "2026-06-23"
    assert three["extensionAmount"] == 3 * three["finalDailyCost"] and not three["extensionPaused"]
    assert three["extensionChargeUntil"] == "2026-06-27"  # 7 days past the end date without a confirmation

    # the planned months are never touched by the extension
    seven = at(client, monkeypatch, url, date(2026, 6, 27))
    assert seven["extendedDays"] == 7 and not seven["extensionPaused"]
    assert [p["cost"] for p in seven["breakdown"]] == [p["cost"] for p in three["breakdown"]]


def test_a_forgotten_contract_stops_charging_after_a_week_until_confirmed(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)
    forgotten = at(client, monkeypatch, url, date(2026, 7, 15))  # 25 days past the end date
    assert forgotten["extensionElapsedDays"] == 25
    assert forgotten["extendedDays"] == 7 and forgotten["extensionPaused"] is True  # the customer is not charged for more
    assert forgotten["extensionAmount"] == 7 * forgotten["finalDailyCost"]

    # nothing to confirm before the end date
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 6, 10))
    assert client.post(f"{url}/confirm-extension").status_code == 409

    # "still running" on 15 Jul confirms the days so far and allows 7 more
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 7, 15))
    confirmed = client.post(f"{url}/confirm-extension").json()
    assert confirmed["extendedDays"] == 25 and not confirmed["extensionPaused"]
    assert confirmed["extensionChargeUntil"] == "2026-07-22"
    paused_again = at(client, monkeypatch, url, date(2026, 8, 1))
    assert paused_again["extendedDays"] == 32 and paused_again["extensionPaused"] is True  # 20 Jun end, charged to 22 Jul


def test_a_contract_can_be_concluded_on_the_day_the_work_really_ended(client, monkeypatch):
    customer, sand, url = deployed_on_its_start(client, monkeypatch)
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 7, 15))  # forgotten for 25 days

    # the end day can't be before the start or in the future
    assert client.post(f"{url}/conclude", json=back(client, url, workEndedOn="2026-04-30")).status_code == 422
    assert client.post(f"{url}/conclude", json=back(client, url, workEndedOn="2026-07-16")).status_code == 422

    # work ended on the end date itself: nothing is charged for the forgotten days
    done = client.post(f"{url}/conclude", json=back(client, url, workEndedOn="2026-06-20")).json()
    assert done["status"] == "Concluded" and done["workEndedOn"] == "2026-06-20"
    assert done["extendedDays"] == 0 and done["extensionAmount"] == 0 and done["extensionPaused"] is False
    assert done["concludedAt"].startswith("2026-07-15")  # recorded on the day it was clicked

    # a wrong date can be corrected afterwards, with the same limits
    assert client.post(f"{url}/adjust-end", json={"workEndedOn": "2026-04-01"}).status_code == 422
    fixed = client.post(f"{url}/adjust-end", json={"workEndedOn": "2026-06-24"}).json()
    assert fixed["workEndedOn"] == "2026-06-24" and fixed["extendedDays"] == 4
    assert fixed["extensionAmount"] == 4 * fixed["finalDailyCost"]
    assert at(client, monkeypatch, url, date(2026, 12, 1))["extendedDays"] == 4  # stays fixed as time passes

    # only a concluded contract can be adjusted, and a concluded one can't be confirmed
    assert client.post(f"{url}/confirm-extension").status_code == 409
    estimated = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 1)))).json()
    assert client.post(f"{API}/contracts/{estimated['id']}/adjust-end", json={"workEndedOn": "2026-05-01"}).status_code == 409


def test_concluding_on_or_before_the_end_date_means_no_extension(client, monkeypatch):
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 1))
    _, _, on_the_day = dispatched_contract(client)
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 6, 20))  # the end date
    assert client.post(f"{API}/contracts/{on_the_day['id']}/conclude", json=back(client, f"{API}/contracts/{on_the_day['id']}")).json()["extendedDays"] == 0

    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 1))
    _, _, early = dispatched_contract(client)
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 15))
    done = client.post(f"{API}/contracts/{early['id']}/conclude", json=back(client, f"{API}/contracts/{early['id']}")).json()
    assert done["extendedDays"] == 0 and done["extensionAmount"] == 0

    # an estimated contract never has an extension
    customer, sand = make_customer(client, "Plain"), make_material(client, "Plain sand", owned=100)
    plain = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 1)))).json()
    assert plain["extendedDays"] == 0


# ---- payments -------------------------------------------------------------------------------------------

def pay(client, url, line, amount, proofs=1, paid_on="2026-05-01", **extra):
    files = [("proofs", (f"proof{i}.png", PNG_BYTES, "image/png")) for i in range(proofs)]
    data = {"line": line, "amount": str(amount), "paidOn": paid_on, **extra}
    return client.post(f"{url}/payments", data=data, files=files or None)


def lines_of(contract):
    return {l["key"]: l for l in contract["billingLines"]}


def test_a_part_payment_leaves_the_balance_on_that_month(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)  # 36,000 final: May 22,320 and June 14,400
    start = client.get(url).json()
    assert [(l["key"], l["amount"], l["status"]) for l in start["billingLines"]] == [("1", 22320, "Unpaid"), ("2", 14400, "Unpaid")]
    assert (start["totalBilled"], start["totalReceived"], start["totalOutstanding"]) == (36720, 0, 36720)

    part = pay(client, url, "1", 12000.5, method="UPI")
    assert part.status_code == 201, part.text
    body = part.json()
    first = lines_of(body)["1"]
    assert (first["paid"], first["balance"], first["status"]) == (12000.5, 10319.5, "Part paid")
    assert lines_of(body)["2"]["status"] == "Unpaid"  # the shortfall is not moved to the next month
    assert body["totalReceived"] == 12000.5 and body["totalOutstanding"] == round(body["totalBilled"] - 12000.5, 2)
    payment = body["payments"][0]
    assert payment["amount"] == 12000.5 and payment["method"] == "UPI" and payment["voided"] is False
    assert [p["kind"] for p in payment["proofs"]] == ["proof1"]

    # paying the rest settles the month
    done = pay(client, url, "1", 10319.5).json()
    assert (lines_of(done)["1"]["balance"], lines_of(done)["1"]["status"]) == (0, "Paid")


def test_paying_more_than_a_month_is_carried_forward_as_credit(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)
    body = pay(client, url, "1", 30000).json()
    one, two = lines_of(body)["1"], lines_of(body)["2"]
    assert (one["status"], one["creditOut"]) == ("Paid", 7680)
    assert (two["creditIn"], two["balance"], two["status"]) == (7680, 6720, "Part paid")

    # more than everything billed is left over on the last line
    over = pay(client, url, "2", 14400).json()
    last = lines_of(over)["2"]
    assert last["status"] == "Overpaid" and last["creditOut"] == 7680 and over["creditBalance"] == 7680


def test_a_payment_needs_proof_images_and_sensible_values(client, monkeypatch):
    customer, sand, url = deployed_on_its_start(client, monkeypatch)
    assert pay(client, url, "1", 100, proofs=0).status_code == 422  # a proof is required
    assert pay(client, url, "1", 100, proofs=3).status_code == 422  # at most two
    assert pay(client, url, "1", 0).status_code == 422
    assert pay(client, url, "1", -5).status_code == 422
    assert pay(client, url, "1", 10.123).status_code == 422  # rupees and paise only
    assert pay(client, url, "9", 100).status_code == 422  # nothing is billed under that line
    assert pay(client, url, "1", 100, paid_on="2026-05-02").status_code == 422  # not in the future ("today" is 1 May 2026 here)
    assert pay(client, url, "1", 100, method="Barter").status_code == 422

    pdf = client.post(f"{url}/payments", data={"line": "1", "amount": "100", "paidOn": "2026-05-01"},
                      files=[("proofs", ("a.pdf", PDF_BYTES, "application/pdf"))])
    assert pdf.status_code == 422  # images only
    fake = client.post(f"{url}/payments", data={"line": "1", "amount": "100", "paidOn": "2026-05-01"},
                       files=[("proofs", ("a.png", NOT_A_REAL_FILE, "image/png"))])
    assert fake.status_code == 422  # a renamed file is caught by its contents
    assert client.get(url).json()["payments"] == []  # none of the failures left anything behind

    # an estimated contract has nothing to pay yet
    estimated = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 1)))).json()
    assert pay(client, f"{API}/contracts/{estimated['id']}", "1", 100).status_code == 409


def test_a_mistaken_payment_is_voided_not_deleted(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)
    body = pay(client, url, "1", 5000).json()
    pid = body["payments"][0]["id"]

    # the proof can be viewed
    proof = client.get(body["payments"][0]["proofs"][0]["url"])
    assert proof.status_code == 200 and proof.content == PNG_BYTES
    assert client.get(f"{url}/payments/999/proofs/proof1").status_code == 404

    # a contract with payments can't be deleted
    assert client.delete(url).status_code == 409

    assert client.post(f"{url}/payments/{pid}/void", json={}).status_code == 422  # a reason is needed
    voided = client.post(f"{url}/payments/{pid}/void", json={"reason": "Entered against the wrong customer"}).json()
    assert voided["payments"][0]["voided"] is True and voided["payments"][0]["voidReason"].startswith("Entered")
    assert voided["totalReceived"] == 0 and lines_of(voided)["1"]["status"] == "Unpaid"  # it no longer counts
    assert client.post(f"{url}/payments/{pid}/void", json={"reason": "again"}).status_code == 409
    assert client.delete(url).status_code == 409  # the record is kept


def test_the_extended_period_can_be_paid_separately(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 6, 24))  # 4 days past the 20 Jun end
    body = client.get(url).json()
    ext = lines_of(body)["extension"]
    assert ext["label"] == "Extended Period" and ext["amount"] == 4 * body["finalDailyCost"]

    part = pay(client, url, "extension", 1000, paid_on="2026-06-24").json()
    assert (lines_of(part)["extension"]["balance"], lines_of(part)["extension"]["status"]) == (ext["amount"] - 1000, "Part paid")
    assert lines_of(part)["1"]["status"] == "Unpaid"


def test_each_line_says_how_much_has_built_up_and_what_is_due_now(client, monkeypatch):
    _, _, url = deployed_on_its_start(client, monkeypatch)  # May: 31 days, 22,320 (720 a day); June: 20 days, 14,400

    # day 10 of May: 10 x 720 = 7,200 has built up; June has not started
    ten = at(client, monkeypatch, url, date(2026, 5, 10))
    one, two = lines_of(ten)["1"], lines_of(ten)["2"]
    assert (one["accrued"], one["dueNow"], two["accrued"], two["dueNow"]) == (7200, 7200, 0, 0)

    # a part payment brings the amount due now down; the month's balance is a different figure
    monkeypatch.setattr("app.services.deployment.today", lambda: date(2026, 5, 10))
    paid = pay(client, url, "1", 5000, paid_on="2026-05-10").json()
    one = lines_of(paid)["1"]
    assert (one["accrued"], one["paid"], one["dueNow"], one["balance"]) == (7200, 5000, 2200, 17320)

    # paying ahead of the days worked leaves nothing due now, even though the month is not settled
    ahead = pay(client, url, "1", 5000, paid_on="2026-05-10").json()
    one = lines_of(ahead)["1"]
    assert (one["paid"], one["dueNow"], one["balance"], one["status"]) == (10000, 0, 12320, "Part paid")

    # a finished month has all of it built up; an advance on an upcoming month shows as paid, not due
    june = pay(client, url, "2", 3000, paid_on="2026-05-10").json()
    assert lines_of(june)["2"]["accrued"] == 0 and lines_of(june)["2"]["dueNow"] == 0 and lines_of(june)["2"]["paid"] == 3000
    done = at(client, monkeypatch, url, date(2026, 6, 20))
    assert lines_of(done)["1"]["accrued"] == 22320 and lines_of(done)["2"]["accrued"] == 14400
    assert lines_of(done)["2"]["dueNow"] == 11400  # 14,400 built up, 3,000 paid


def test_concluding_records_what_came_back_of_every_material(client, monkeypatch):
    customer = make_customer(client)
    sand, bricks = make_material(client, owned=200), make_material(client, "Bricks", owned=200)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 50), (bricks, 20)))).json()
    url = f"{API}/contracts/{contract['id']}"
    client.post(f"{url}/dispatch", json=dispatch_payload((sand, 50), (bricks, 20)))
    client.post(f"{url}/deploy", json={"confirmEarlyStart": True})
    conclude = f"{url}/conclude"

    def body(sand_back, bricks_back, sand_to="Back to Yard", bricks_to="Moved to Another Site"):
        return {"materials": [
            {"materialId": sand["id"], "intact": sand_back[0], "damaged": sand_back[1], "destination": sand_to},
            {"materialId": bricks["id"], "intact": bricks_back[0], "damaged": bricks_back[1], "destination": bricks_to},
        ]}

    # it can't be more than was dispatched, a material can't be left out, and the request needs the list at all
    assert client.post(conclude, json=body((40, 11), (20, 0))).status_code == 422  # 51 of 50
    assert client.post(conclude, json=body((40, 5), (15, 6))).status_code == 422  # 21 of 20
    assert client.post(conclude, json={"materials": [{"materialId": sand["id"], "intact": 1, "damaged": 0}]}).status_code == 422
    assert client.post(conclude, json={}).status_code == 422
    assert client.post(conclude, json=body((-1, 0), (0, 0))).status_code == 422
    # where it went: needed when anything came back, and only one of the two choices
    assert client.post(conclude, json=body((40, 7), (20, 0), sand_to=None)).status_code == 422
    assert client.post(conclude, json=body((40, 7), (20, 0), sand_to="")).status_code == 422
    assert client.post(conclude, json=body((40, 7), (20, 0), bricks_to="Thrown away")).status_code == 422
    assert client.get(url).json()["status"] == "Deployed"  # none of those concluded it

    done = client.post(conclude, json=body((40, 7), (20, 0))).json()
    assert done["status"] == "Concluded"
    by_name = {m["name"]: m for m in done["materials"]}
    assert (by_name["M-Sand"]["retrievedIntact"], by_name["M-Sand"]["retrievedDamaged"]) == (40, 7)  # 3 were not returned
    assert (by_name["Bricks"]["retrievedIntact"], by_name["Bricks"]["retrievedDamaged"]) == (20, 0)
    assert by_name["M-Sand"]["returnDestination"] == "Back to Yard" and by_name["Bricks"]["returnDestination"] == "Moved to Another Site"

    # before conclusion nothing is recorded
    assert all(m["retrievedIntact"] is None for m in client.get(f"{API}/contracts/{client.post(f'{API}/contracts', json=contract_payload(customer['id'], lines((sand, 1)))).json()['id']}").json()["materials"])


def test_a_material_that_did_not_come_back_has_no_destination(client, monkeypatch):
    customer, sand = make_customer(client), make_material(client, owned=100)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 10)))).json()
    url = f"{API}/contracts/{contract['id']}"
    client.post(f"{url}/dispatch", json=dispatch_payload((sand, 10)))
    client.post(f"{url}/deploy", json={"confirmEarlyStart": True})
    done = client.post(f"{url}/conclude", json={"materials": [{"materialId": sand["id"], "intact": 0, "damaged": 0}]})
    assert done.status_code == 200, done.text  # nothing came back: no destination needed
    line = done.json()["materials"][0]
    assert (line["retrievedIntact"], line["retrievedDamaged"], line["returnDestination"]) == (0, 0, None)
