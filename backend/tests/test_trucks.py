from tests.conftest import PDF_BYTES, PNG_BYTES

API = "/api/v1"

DOC_TYPES = ["rc", "fc", "roadTax", "insurance", "nationalPermit", "localPermit", "pollution"]
NEEDS_NUMBER = {"roadTax": "RT-TN-998877", "nationalPermit": "NP-TN-554433", "localPermit": "LP-TN-112233", "pollution": "TN09BR0012345"}


def documents(**overrides):
    docs = {
        t: {"number": NEEDS_NUMBER.get(t), "validity": "2027-03-31", "expense": 5000}
        for t in DOC_TYPES
    }
    docs.update(overrides)
    return docs


def truck_payload(**overrides):
    return {
        "registrationNumber": "tn 69  aa 1256",
        "manufacturer": "Tata Motors",
        "modelName": "Signa 4623.S",
        "chassisNumber": "tatz94ae7p7a0001",
        "yearOfManufacture": 2019,
        "truckType": "Tipper",
        "odometer": 84500,
        "fuelCapacity": 400,
        "tyreLayout": "10+1",
        "documents": documents(),
        **overrides,
    }


def make_truck(client, **overrides):
    response = client.post(f"{API}/trucks", json=truck_payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def test_create_truck_normalises_numbers_and_lists_all_documents(client):
    truck = make_truck(client)
    assert truck["registrationNumber"] == "TN 69 AA 1256"
    assert truck["chassisNumber"] == "TATZ94AE7P7A0001"
    assert list(truck["documents"]) == DOC_TYPES
    assert truck["documents"]["roadTax"]["number"] == "RT-TN-998877"
    assert truck["documents"]["rc"]["file"] is None
    assert truck["missingFiles"] == DOC_TYPES


def test_truck_validation(client):
    bad = {
        "tyreLayout": "4x2",
        "yearOfManufacture": 1900,
        "fuelCapacity": 0,
        "odometer": -1,
        "registrationNumber": "",
    }
    for field, value in bad.items():
        assert client.post(f"{API}/trucks", json=truck_payload(**{field: value})).status_code == 422, field


def test_documents_must_be_complete_and_numbered(client):
    incomplete = {k: v for k, v in documents().items() if k != "fc"}
    assert client.post(f"{API}/trucks", json=truck_payload(documents=incomplete)).status_code == 422
    assert client.post(f"{API}/trucks", json=truck_payload(documents=documents(extra={"validity": "2027-01-01", "expense": 1}))).status_code == 422
    no_number = documents(roadTax={"number": " ", "validity": "2027-01-01", "expense": 1})
    assert client.post(f"{API}/trucks", json=truck_payload(documents=no_number)).status_code == 422


def test_registration_and_chassis_must_be_unique(client):
    make_truck(client)
    # same registration written differently still collides after normalising
    assert client.post(f"{API}/trucks", json=truck_payload(chassisNumber="OTHER123")).status_code == 409
    assert client.post(f"{API}/trucks", json=truck_payload(registrationNumber="TN 01 AB 0001")).status_code == 409


def test_upload_document_proofs(client):
    truck = make_truck(client)
    url = f"{API}/trucks/{truck['id']}/files"
    # RC and insurance accept a PDF or an image; the rest are PDF only
    assert client.put(f"{url}/rc", files={"file": ("rc.png", PNG_BYTES)}).status_code == 200
    assert client.put(f"{url}/insurance", files={"file": ("ins.pdf", PDF_BYTES)}).status_code == 200
    assert client.put(f"{url}/fc", files={"file": ("fc.png", PNG_BYTES)}).status_code == 422

    got = client.get(f"{API}/trucks/{truck['id']}").json()
    assert got["documents"]["rc"]["file"]["contentType"] == "image/png"
    assert "rc" not in got["missingFiles"] and "fc" in got["missingFiles"]
    assert client.get(got["documents"]["rc"]["file"]["url"]).content == PNG_BYTES


def test_update_keeps_proofs_and_delete_removes_them(client, tmp_path):
    truck = make_truck(client)
    client.put(f"{API}/trucks/{truck['id']}/files/fc", files={"file": ("fc.pdf", PDF_BYTES)})

    new_docs = documents(fc={"number": None, "validity": "2028-01-01", "expense": 15000})
    updated = client.put(f"{API}/trucks/{truck['id']}", json=truck_payload(documents=new_docs, odometer=90000))
    assert updated.status_code == 200, updated.text
    body = updated.json()
    assert body["odometer"] == 90000
    assert body["documents"]["fc"]["validity"] == "2028-01-01" and body["documents"]["fc"]["file"] is not None

    folder = tmp_path / "uploads" / "truck" / str(truck["id"])
    assert folder.exists()
    assert client.delete(f"{API}/trucks/{truck['id']}").status_code == 204
    assert not folder.exists()
    assert client.get(f"{API}/trucks").json() == []
