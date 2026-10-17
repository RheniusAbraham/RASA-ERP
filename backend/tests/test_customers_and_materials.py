API = "/api/v1"

CUSTOMER = {
    "name": "  Rhenius Abraham R ",
    "phone": "7470047400",
    "contactPerson": "Rhenius",
    "gst": "123456789",
    "email": "rhenius1603@gmail.com",
    "address": "Salvation Road",
}


def make_customer(client, **overrides):
    response = client.post(f"{API}/customers", json={**CUSTOMER, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


# ---- customers -------------------------------------------------------------


def test_create_customer_returns_camel_case_and_trims_whitespace(client):
    customer = make_customer(client)
    assert customer["id"] == 1
    assert customer["name"] == "Rhenius Abraham R"
    assert customer["contactPerson"] == "Rhenius"
    assert "createdAt" in customer


def test_optional_customer_fields_default_to_empty(client):
    customer = make_customer(client, **{"contactPerson": "", "gst": "", "email": "", "address": ""})
    assert customer["gst"] == "" and customer["email"] == ""


def test_customer_requires_name_and_phone(client):
    assert client.post(f"{API}/customers", json={"name": "", "phone": "1"}).status_code == 422
    assert client.post(f"{API}/customers", json={"name": "A", "phone": "   "}).status_code == 422


def test_list_get_update_delete_customer(client):
    created = make_customer(client)
    assert [c["id"] for c in client.get(f"{API}/customers").json()] == [created["id"]]
    assert client.get(f"{API}/customers/{created['id']}").json()["phone"] == "7470047400"

    updated = client.put(f"{API}/customers/{created['id']}", json={**CUSTOMER, "phone": "9999999999"})
    assert updated.status_code == 200 and updated.json()["phone"] == "9999999999"

    assert client.delete(f"{API}/customers/{created['id']}").status_code == 204
    assert client.get(f"{API}/customers/{created['id']}").status_code == 404


def test_missing_customer_is_404(client):
    assert client.get(f"{API}/customers/999").status_code == 404
    assert client.put(f"{API}/customers/999", json=CUSTOMER).status_code == 404
    assert client.delete(f"{API}/customers/999").status_code == 404


# ---- materials -------------------------------------------------------------

MATERIAL = {
    "name": "M-Sand",
    "totalQuantityOwned": 1200,
    "quantityUnit": "sq ft",
    "structuralDescription": "Fine aggregate, 4.75mm",
    "additionalInformation": "",
}


def test_material_crud(client):
    created = client.post(f"{API}/materials", json=MATERIAL)
    assert created.status_code == 201, created.text
    material = created.json()
    assert "rate" not in material and "rateUnit" not in material
    assert material["totalQuantityOwned"] == 1200 and material["quantityUnit"] == "sq ft"
    assert material["additionalInformation"] == ""
    assert "costPerPiece" not in material

    assert len(client.get(f"{API}/materials").json()) == 1
    updated = client.put(f"{API}/materials/{material['id']}", json={**MATERIAL, "totalQuantityOwned": 900})
    assert updated.json()["totalQuantityOwned"] == 900
    assert client.delete(f"{API}/materials/{material['id']}").status_code == 204
    assert client.get(f"{API}/materials/{material['id']}").status_code == 404


def test_material_validation(client):
    assert client.post(f"{API}/materials", json={**MATERIAL, "name": ""}).status_code == 422
    assert client.post(f"{API}/materials", json={**MATERIAL, "totalQuantityOwned": -1}).status_code == 422
    assert client.post(f"{API}/materials", json={**MATERIAL, "totalQuantityOwned": 2.5}).status_code == 422
    missing = {k: v for k, v in MATERIAL.items() if k != "totalQuantityOwned"}
    assert client.post(f"{API}/materials", json=missing).status_code == 422
    assert client.post(f"{API}/materials", json={**MATERIAL, "structuralDescription": ""}).status_code == 422


def test_a_unit_that_is_not_on_the_list_can_be_typed_in(client):
    response = client.post(f"{API}/materials", json={**MATERIAL, "quantityUnit": "  cu yd "})
    assert response.status_code == 201
    assert response.json()["quantityUnit"] == "cu yd"  # whitespace is trimmed


def test_the_quantity_unit_is_required(client):
    without = {k: v for k, v in MATERIAL.items() if k != "quantityUnit"}
    assert client.post(f"{API}/materials", json=without).status_code == 422
    assert client.post(f"{API}/materials", json={**MATERIAL, "quantityUnit": "   "}).status_code == 422
    assert client.post(f"{API}/materials", json={**MATERIAL, "quantityUnit": "x" * 41}).status_code == 422


def test_materials_have_no_price(client):
    # a price sent by an old client is ignored, and none is stored or returned
    made = client.post(f"{API}/materials", json={**MATERIAL, "rate": 10, "rateUnit": "Per Day"})
    assert made.status_code == 201, made.text
    assert "rate" not in made.json() and "rateUnit" not in made.json()
