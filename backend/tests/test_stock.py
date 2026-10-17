from tests.test_contracts import API, contract_payload, dispatch_payload, lines, make_customer, make_material, pay


def concluded(client, material, sent, intact, damaged, destination="Back to Yard", site_note=None):
    """A contract that took `sent` of the material, was deployed and concluded with the given things coming back."""
    customer = make_customer(client, f"Customer {material['id']}-{sent}-{intact}")
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((material, sent)))).json()
    url = f"{API}/contracts/{contract['id']}"
    assert client.post(f"{url}/dispatch", json=dispatch_payload((material, sent))).status_code == 200
    assert client.post(f"{url}/deploy", json={"confirmEarlyStart": True}).status_code == 200
    item = {"materialId": material["id"], "intact": intact, "damaged": damaged, "destination": destination, "siteNote": site_note}
    done = client.post(f"{url}/conclude", json={"materials": [item]})
    assert done.status_code == 200, done.text
    return done.json()


def stock(client, material):
    return client.get(f"{API}/materials/{material['id']}/distribution").json()


def act(client, material, action, quantity, reason="Checked in the yard", **extra):
    return client.post(f"{API}/materials/{material['id']}/stock-actions", json={"action": action, "quantity": quantity, "reason": reason, **extra})


def test_what_came_back_goes_to_the_right_buckets(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=50, intact=30, damaged=10)  # 10 did not come back
    s = stock(client, pipes)
    # 100 owned, 10 lost: 90 owned now. 10 are damaged in the yard. The 30 intact are back, so 80 are available.
    assert (s["totalOwned"], s["lost"], s["damaged"], s["elsewhere"], s["inUse"], s["available"]) == (90, 10, 10, 0, 0, 80)
    assert [(m["kind"], m["quantity"]) for m in reversed(s["movements"])] == [("Returned to yard", 30), ("Damaged", 10), ("Lost", 10)]
    # the concluded contract no longer holds the material
    assert s["contracts"][0]["holding"] is False and s["contracts"][0]["retrievedIntact"] == 30

    # the material list carries the same buckets
    row = client.get(f"{API}/materials/{pipes['id']}").json()
    assert (row["lost"], row["damaged"], row["elsewhere"]) == (10, 10, 0)


def test_units_moved_to_another_site_wait_there_and_are_not_in_the_yard(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=50, intact=40, damaged=5, destination="Moved to Another Site", site_note="Karunya Nagar plot 9")
    s = stock(client, pipes)
    # 5 lost: 95 owned. 5 damaged, 40 waiting at another site, so 50 are in the yard.
    assert (s["totalOwned"], s["damaged"], s["elsewhere"], s["lost"], s["available"]) == (95, 5, 40, 5, 50)
    lot = s["lots"][0]
    assert (lot["quantity"], lot["note"], lot["daysWaiting"]) == (40, "Karunya Nagar plot 9", 0) and lot["fromCustomer"]
    assert "Moved to another site" in [m["kind"] for m in s["movements"]]


def test_only_what_is_in_the_yard_can_go_on_a_new_contract(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=50, intact=30, damaged=10)  # 80 available
    customer = make_customer(client, "Next customer")
    too_many = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 81))))
    assert too_many.status_code == 422 and "Only 80 pcs of Pipes are available" in too_many.json()["detail"]
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 80)))).status_code == 201

    # units waiting at another site are not in the yard, but a contract can still be planned with them
    sand = make_material(client, "Sand", owned=100)
    concluded(client, sand, sent=60, intact=60, damaged=0, destination="Moved to Another Site")
    assert stock(client, sand)["available"] == 40 and stock(client, sand)["elsewhere"] == 60
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 100)))).status_code == 201
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((sand, 1)))).status_code == 422  # all 100 are planned


def test_damaged_units_can_be_repaired_or_written_off(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=50, intact=30, damaged=10)  # damaged 10, available 80, owned 90

    s = act(client, pipes, "repair", 4).json()
    assert (s["damaged"], s["available"], s["totalOwned"]) == (6, 84, 90)
    s = act(client, pipes, "write-off-damaged", 2).json()
    assert (s["damaged"], s["lost"], s["totalOwned"], s["available"]) == (4, 12, 88, 84)
    assert s["movements"][0]["kind"] == "Written off (damaged)" and s["movements"][0]["reason"] == "Checked in the yard"

    assert act(client, pipes, "repair", 5).status_code == 422  # only 4 are damaged
    assert act(client, pipes, "repair", 1, reason="").status_code == 422  # a reason is needed
    assert act(client, pipes, "repair", 0).status_code == 422


def test_stock_corrections_move_units_between_buckets(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=50, intact=40, damaged=0, destination="Moved to Another Site", site_note="Salem site")
    lot = stock(client, pipes)["lots"][0]  # 40 waiting, 10 lost: owned 90, available 50

    # some units found damaged in the yard, some written off from the yard
    s = act(client, pipes, "mark-damaged", 5).json()
    assert (s["damaged"], s["available"]) == (5, 45)
    s = act(client, pipes, "write-off-yard", 5).json()
    assert (s["lost"], s["totalOwned"], s["available"]) == (15, 85, 40)
    assert act(client, pipes, "mark-damaged", 41).status_code == 422  # only 40 are in the yard

    # bring some of the units waiting at another site to the yard
    assert act(client, pipes, "lot-to-yard", 15).status_code == 422  # which lot?
    assert act(client, pipes, "lot-to-yard", 15, lotId=999).status_code == 422
    s = act(client, pipes, "lot-to-yard", 15, lotId=lot["id"]).json()
    assert (s["elsewhere"], s["available"], s["lots"][0]["quantity"]) == (25, 55, 25)
    assert act(client, pipes, "lot-to-yard", 26, lotId=lot["id"]).status_code == 422
    s = act(client, pipes, "lot-to-yard", 25, lotId=lot["id"]).json()
    assert (s["elsewhere"], s["lots"], s["available"]) == (0, [], 80)  # an emptied lot is gone

    # units written off turn up again
    s = act(client, pipes, "restore-lost", 3).json()
    assert (s["lost"], s["totalOwned"], s["available"]) == (12, 88, 83)
    assert act(client, pipes, "restore-lost", 13).status_code == 422
    assert client.post(f"{API}/materials/999/stock-actions", json={"action": "repair", "quantity": 1, "reason": "x"}).status_code == 404

    # a material with stock movements on record can't be deleted
    assert client.delete(f"{API}/materials/{pipes['id']}").status_code == 409


# ---- Part 2: where dispatched units are taken from ------------------------------------------------------

def plan(client, material, quantity, name="Next"):
    customer = make_customer(client, name)
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((material, quantity)))).json()
    return customer, contract, f"{API}/contracts/{contract['id']}"


def dispatch_from(client, url, material, quantity, sources):
    body = dispatch_payload((material, quantity))
    body["materials"][0]["sources"] = sources
    return client.post(f"{url}/dispatch", json=body)


def test_dispatching_takes_units_from_the_sources_the_user_chooses(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=50, intact=50, damaged=0, destination="Moved to Another Site", site_note="Salem site")
    lot = stock(client, pipes)["lots"][0]  # 50 free at another site, 50 in the yard
    assert (stock(client, pipes)["available"], stock(client, pipes)["elsewhere"]) == (50, 50)

    _, contract, url = plan(client, pipes, 80)  # planning counts the yard plus the other site: 100
    # the sources have to add up to what is dispatched
    assert dispatch_from(client, url, pipes, 80, [{"lotId": lot["id"], "quantity": 50}]).status_code == 422
    assert dispatch_from(client, url, pipes, 80, []).status_code == 422
    # no more than a source holds
    assert dispatch_from(client, url, pipes, 80, [{"lotId": lot["id"], "quantity": 51}, {"lotId": None, "quantity": 29}]).status_code == 422
    assert dispatch_from(client, url, pipes, 80, [{"lotId": lot["id"], "quantity": 20}, {"lotId": None, "quantity": 60}]).status_code == 422
    assert client.get(url).json()["status"] == "Estimated"  # none of those changed anything
    assert stock(client, pipes)["elsewhere"] == 50

    done = dispatch_from(client, url, pipes, 80, [{"lotId": lot["id"], "quantity": 50}, {"lotId": None, "quantity": 30}])
    assert done.status_code == 200, done.text
    sources = done.json()["materials"][0]["sources"]
    assert [(s["label"], s["quantity"], s["yard"]) for s in sources] == [("Yard", 30, True), ("Salem site", 50, False)] or \
        sorted((s["label"], s["quantity"], s["yard"]) for s in sources) == [("Salem site", 50, False), ("Yard", 30, True)]

    # the lot is used up and gone; the yard gave 30; 80 are in use
    s = stock(client, pipes)
    assert (s["elsewhere"], s["lots"], s["inUse"], s["available"]) == (0, [], 80, 20)
    assert "Taken from another site" in [m["kind"] for m in s["movements"]]

    # a partly used lot stays, with what is left
    sand = make_material(client, "Sand", owned=100)
    concluded(client, sand, sent=40, intact=40, damaged=0, destination="Moved to Another Site", site_note="Karunya")
    lot2 = stock(client, sand)["lots"][0]
    _, _, url2 = plan(client, sand, 10, "Small")
    assert dispatch_from(client, url2, sand, 10, [{"lotId": lot2["id"], "quantity": 10}]).status_code == 200
    left = stock(client, sand)
    assert (left["elsewhere"], left["lots"][0]["quantity"], left["available"]) == (30, 30, 60)

    # another material's lot can't be used
    pipes2 = make_material(client, "Other", owned=100)
    _, _, url3 = plan(client, pipes2, 5, "Third")
    assert dispatch_from(client, url3, pipes2, 5, [{"lotId": lot2["id"], "quantity": 5}]).status_code == 422


def test_more_materials_can_be_sent_to_a_running_contract(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=30, intact=30, damaged=0, destination="Moved to Another Site", site_note="Salem site")
    lot = stock(client, pipes)["lots"][0]  # 30 at another site, 70 in the yard
    _, contract, url = plan(client, pipes, 20, "Running")
    assert dispatch_from(client, url, pipes, 20, [{"lotId": None, "quantity": 20}]).status_code == 200  # 20 from the yard

    more = lambda sources: client.post(f"{url}/send-more", json={"materials": [{"materialId": pipes["id"], "sources": sources}]})
    assert more([{"lotId": lot["id"], "quantity": 31}]).status_code == 422  # only 30 are waiting
    assert more([{"lotId": None, "quantity": 51}]).status_code == 422  # only 50 are left in the yard
    done = more([{"lotId": lot["id"], "quantity": 30}, {"lotId": None, "quantity": 5}])
    assert done.status_code == 200, done.text
    assert len(done.json()["materials"]) == 1
    line = done.json()["materials"][0]
    assert line["dispatchedQuantity"] == 55 and sum(s["quantity"] for s in line["sources"]) == 55
    s = stock(client, pipes)
    assert (s["inUse"], s["elsewhere"], s["available"]) == (55, 0, 45)

    # only materials that are on the contract, and only while it is running
    other = make_material(client, "Other", owned=10)
    assert client.post(f"{url}/send-more", json={"materials": [{"materialId": other["id"], "sources": [{"lotId": None, "quantity": 1}]}]}).status_code == 422
    _, estimated, est_url = plan(client, pipes, 1, "Not yet")
    assert more_for(client, est_url, pipes).status_code == 409


def more_for(client, url, material):
    return client.post(f"{url}/send-more", json={"materials": [{"materialId": material["id"], "sources": [{"lotId": None, "quantity": 1}]}]})


def test_units_can_move_straight_to_another_running_contract_when_concluding(client):
    pipes = make_material(client, "Pipes", owned=100)
    # contract A takes 40 and will be concluded; contract B is running and takes 30 more later
    cust_a = make_customer(client, "Site A")
    a = client.post(f"{API}/contracts", json=contract_payload(cust_a["id"], lines((pipes, 40)))).json()
    a_url = f"{API}/contracts/{a['id']}"
    client.post(f"{a_url}/dispatch", json=dispatch_payload((pipes, 40)))
    client.post(f"{a_url}/deploy", json={"confirmEarlyStart": True})
    _, b, b_url = plan(client, pipes, 30, "Site B")
    assert dispatch_from(client, b_url, pipes, 30, [{"lotId": None, "quantity": 30}]).status_code == 200  # the yard now has 30

    def conclude(target, intact=40, destination="Moved to Another Site"):
        item = {"materialId": pipes["id"], "intact": intact, "damaged": 0, "destination": destination, "assignToContractId": target}
        return client.post(f"{a_url}/conclude", json={"materials": [item]})

    # only a running contract with the material, and only for intact units that move on
    assert conclude(a["id"]).status_code == 422  # itself
    assert conclude(999).status_code == 422
    assert conclude(b["id"], destination="Back to Yard").status_code == 422
    assert client.get(a_url).json()["status"] == "Deployed"  # none of those concluded it

    done = conclude(b["id"])
    assert done.status_code == 200, done.text
    b_now = client.get(b_url).json()["materials"][0]
    assert b_now["dispatchedQuantity"] == 70  # 30 + the 40 that came straight from site A
    assert [s["quantity"] for s in b_now["sources"] if not s["yard"]] == [40]
    # the yard was not touched: 30 left in it, nothing waits at another site, and B holds 70
    s = stock(client, pipes)
    assert (s["inUse"], s["elsewhere"], s["available"], s["lots"]) == (70, 0, 30, [])


def test_lots_waiting_at_another_site_are_listed_for_the_bell(client):
    assert client.get(f"{API}/materials/lots/waiting").json() == []
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=20, intact=20, damaged=0, destination="Moved to Another Site", site_note="Salem site")
    rows = client.get(f"{API}/materials/lots/waiting").json()
    assert len(rows) == 1
    assert (rows[0]["materialName"], rows[0]["quantity"], rows[0]["note"], rows[0]["daysWaiting"]) == ("Pipes", 20, "Salem site", 0)


def test_a_planned_contract_does_not_block_the_yard_when_other_sites_can_cover_it(client):
    pipes = make_material(client, "Pipes", owned=100)
    concluded(client, pipes, sent=40, intact=40, damaged=0, destination="Moved to Another Site", site_note="Salem")  # 40 at a site
    _, planned, _ = plan(client, pipes, 60, "Planned only")  # asks for 60: 40 can come from the site, 20 from the yard
    # the yard has 60, and the plan needs only 20 of it, so another contract can still take 10 from the yard
    s = stock(client, pipes)
    assert (s["available"], s["elsewhere"], s["inUse"]) == (40, 40, 60)
    _, other, other_url = plan(client, pipes, 10, "Takes from the yard")
    assert dispatch_from(client, other_url, pipes, 10, [{"lotId": None, "quantity": 10}]).status_code == 200
    # what is left in the yard is what the plan still needs to be safe: 100 - 40 at the site - 10 sent - 20 for the plan
    assert stock(client, pipes)["available"] == 30
    # the plan can still be dispatched with the lot and the yard
    lot = stock(client, pipes)["lots"][0]
    _, _, planned_url = None, None, f"{API}/contracts/{planned['id']}"
    assert dispatch_from(client, planned_url, pipes, 60, [{"lotId": lot["id"], "quantity": 40}, {"lotId": None, "quantity": 20}]).status_code == 200


def test_only_a_concluded_contract_can_be_closed(client):
    pipes = make_material(client, "Pipes", owned=100)
    done = concluded(client, pipes, sent=10, intact=10, damaged=0)
    url = f"{API}/contracts/{done['id']}"
    assert done["status"] == "Concluded" and done["closedAt"] is None

    owed = done["totalOutstanding"]
    assert owed > 0
    refused_unpaid = client.post(f"{url}/close")
    assert refused_unpaid.status_code == 409 and "still unpaid" in refused_unpaid.json()["detail"]
    for line in done["billingLines"]:
        if line["balance"] > 0:
            r = pay(client, url, line["key"], line["balance"], paid_on=done["workEndedOn"]); assert r.status_code == 201, r.text

    closed = client.post(f"{url}/close")
    assert closed.status_code == 200, closed.text
    body = closed.json()
    # payments can't be added or voided once closed
    assert pay(client, url, "1", 1).status_code == 409
    assert client.post(f"{url}/payments/{body['payments'][0]['id']}/void", json={"reason": "Entered wrongly"}).status_code == 409
    assert body["status"] == "Closed" and body["closedAt"] is not None
    assert body["concludedAt"] is not None and body["workEndedOn"] is not None  # the earlier phases are kept
    # a closed contract is still a record: its billing and the stock it returned are unchanged
    assert body["billingLines"] and stock(client, pipes)["inUse"] == 0

    assert client.post(f"{url}/close").status_code == 409  # only once
    assert client.post(f"{url}/conclude", json={"materials": [{"materialId": pipes["id"], "intact": 0, "damaged": 0}]}).status_code == 409
    assert client.post(f"{url}/adjust-end", json={"workEndedOn": "2026-04-01"}).status_code == 409  # the end day is final now
    assert client.post(f"{API}/contracts/999/close").status_code == 404

    # a contract that is not concluded yet can't be closed
    customer = make_customer(client, "Not yet")
    open_contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], lines((pipes, 1)))).json()
    refused = client.post(f"{API}/contracts/{open_contract['id']}/close")
    assert refused.status_code == 409 and "Conclude the contract" in refused.json()["detail"]
