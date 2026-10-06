API = "/api/v1"


def make_customer(client, name="Acme Builders"):
    return client.post(f"{API}/customers", json={"name": name, "phone": "9000000000"}).json()


def make_material(client, name="M-Sand"):
    return client.post(
        f"{API}/materials",
        json={"name": name, "costPerPiece": 10, "totalQuantityOwned": 100, "structuralDescription": "fine"},
    ).json()


def contract_payload(customer_id, material_ids, **overrides):
    return {
        "customerId": customer_id,
        "siteAddress": "Plot 4, Salvation Road",
        "materialIds": material_ids,
        "startDate": "2026-05-01",
        "months": 1,
        "days": 20,
        "transportationCost": 6000,
        "materialsCost": 30000,
        "estimatedCost": 36000,
        **overrides,
    }


def test_create_contract_returns_customer_materials_and_breakdown(client):
    customer, sand, bricks = make_customer(client), make_material(client), make_material(client, "Bricks")
    response = client.post(f"{API}/contracts", json=contract_payload(customer["id"], [sand["id"], bricks["id"]]))
    assert response.status_code == 201, response.text
    contract = response.json()

    assert contract["customerName"] == "Acme Builders"
    assert [m["name"] for m in contract["materials"]] == ["M-Sand", "Bricks"]
    assert contract["dailyRate"] == 720
    first, second = contract["breakdown"]
    assert first == {"label": "1st month", "from": "2026-05-01", "to": "2026-05-31", "days": 31, "cost": 22320}
    assert second["label"] == "2nd month" and second["days"] == 20 and second["cost"] == 14400


def test_contract_needs_existing_customer_and_materials(client):
    customer, sand = make_customer(client), make_material(client)
    assert client.post(f"{API}/contracts", json=contract_payload(999, [sand["id"]])).status_code == 404
    assert client.post(f"{API}/contracts", json=contract_payload(customer["id"], [sand["id"], 999])).status_code == 404


def test_contract_validation(client):
    customer, sand = make_customer(client), make_material(client)
    ok = contract_payload(customer["id"], [sand["id"]])
    assert client.post(f"{API}/contracts", json={**ok, "months": 0, "days": 0}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materialIds": []}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "materialIds": [sand["id"], sand["id"]]}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "estimatedCost": -1}).status_code == 422
    assert client.post(f"{API}/contracts", json={**ok, "days": 31}).status_code == 422


def test_list_filter_update_delete(client):
    a, b, sand = make_customer(client), make_customer(client, "Second Co"), make_material(client)
    first = client.post(f"{API}/contracts", json=contract_payload(a["id"], [sand["id"]])).json()
    client.post(f"{API}/contracts", json=contract_payload(b["id"], [sand["id"]]))

    assert len(client.get(f"{API}/contracts").json()) == 2
    only_a = client.get(f"{API}/contracts", params={"customer_id": a["id"]}).json()
    assert [c["id"] for c in only_a] == [first["id"]]

    updated = client.put(f"{API}/contracts/{first['id']}", json=contract_payload(a["id"], [sand["id"]], months=2, days=0, estimatedCost=60000))
    assert updated.status_code == 200 and len(updated.json()["breakdown"]) == 2

    assert client.delete(f"{API}/contracts/{first['id']}").status_code == 204
    assert client.get(f"{API}/contracts/{first['id']}").status_code == 404


def test_customer_and_material_in_use_cannot_be_deleted(client):
    customer, sand, spare = make_customer(client), make_material(client), make_material(client, "Spare")
    contract = client.post(f"{API}/contracts", json=contract_payload(customer["id"], [sand["id"]])).json()

    assert client.delete(f"{API}/customers/{customer['id']}").status_code == 409
    assert client.delete(f"{API}/materials/{sand['id']}").status_code == 409
    assert client.delete(f"{API}/materials/{spare['id']}").status_code == 204  # unused material is fine

    client.delete(f"{API}/contracts/{contract['id']}")
    assert client.delete(f"{API}/customers/{customer['id']}").status_code == 204
    assert client.delete(f"{API}/materials/{sand['id']}").status_code == 204
