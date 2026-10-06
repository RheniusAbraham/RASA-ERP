from tests.conftest import NOT_A_REAL_FILE, PDF_BYTES, PNG_BYTES

API = "/api/v1"

DRIVER = {
    "name": "Ravi Kumar",
    "phone": "9000000001",
    "aadhaarNumber": "123456789012",
    "dateOfBirth": "1988-03-14",
    "dateOfJoining": "2021-06-01",
    "licenseNumber": "TN6920190001234",
    "address": "12 Gandhi Street, Coimbatore",
    "bankName": "HDFC Bank",
    "branchName": "Coimbatore Main",
    "accountNumber": "1234567890123456",
    "ifscCode": "hdfc0001234",
    "fixedHireAmount": 18000,
}


def make_driver(client, **overrides):
    response = client.post(f"{API}/drivers", json={**DRIVER, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def upload(client, driver_id, kind, content, name="doc.pdf"):
    return client.put(f"{API}/drivers/{driver_id}/files/{kind}", files={"file": (name, content)})


def test_create_driver_normalises_ifsc_and_reports_missing_files(client):
    driver = make_driver(client)
    assert driver["ifscCode"] == "HDFC0001234"
    assert driver["files"] == {}
    assert driver["missingFiles"] == ["aadhaarProof", "licenseProof"]  # photo is optional


def test_driver_validation(client):
    bad = {
        "aadhaarNumber": "12345",
        "accountNumber": "123",
        "ifscCode": "NOTANIFSC",
        "dateOfBirth": "2999-01-01",
        "fixedHireAmount": -5,
        "licenseNumber": "",
    }
    for field, value in bad.items():
        assert client.post(f"{API}/drivers", json={**DRIVER, field: value}).status_code == 422, field
    # joined before being born
    assert client.post(f"{API}/drivers", json={**DRIVER, "dateOfJoining": "1980-01-01"}).status_code == 422


def test_license_number_must_be_unique(client):
    make_driver(client)
    assert client.post(f"{API}/drivers", json=DRIVER).status_code == 409


def test_upload_and_download_files(client):
    driver = make_driver(client)
    assert upload(client, driver["id"], "aadhaarProof", PDF_BYTES, "aadhaar.pdf").status_code == 200
    assert upload(client, driver["id"], "licenseProof", PDF_BYTES, "licence.pdf").status_code == 200
    assert upload(client, driver["id"], "photo", PNG_BYTES, "me.png").status_code == 200

    got = client.get(f"{API}/drivers/{driver['id']}").json()
    assert got["missingFiles"] == []
    assert got["files"]["aadhaarProof"]["filename"] == "aadhaar.pdf"
    assert got["files"]["photo"]["contentType"] == "image/png"

    download = client.get(got["files"]["aadhaarProof"]["url"])
    assert download.status_code == 200 and download.content == PDF_BYTES
    assert download.headers["content-type"] == "application/pdf"


def test_file_type_is_checked_by_content_not_name(client):
    driver = make_driver(client)
    # an executable renamed to .pdf
    assert upload(client, driver["id"], "aadhaarProof", NOT_A_REAL_FILE, "evil.pdf").status_code == 422
    # an image where a PDF is required
    assert upload(client, driver["id"], "licenseProof", PNG_BYTES, "licence.png").status_code == 422
    # a PDF where a photo is required
    assert upload(client, driver["id"], "photo", PDF_BYTES, "photo.pdf").status_code == 422
    assert upload(client, driver["id"], "aadhaarProof", b"", "empty.pdf").status_code == 422


def test_file_size_limit(client, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_upload_mb", 0.001)  # ~1 KB
    driver = make_driver(client)
    big = PDF_BYTES + b"x" * 2048
    assert upload(client, driver["id"], "aadhaarProof", big).status_code == 413


def test_unknown_kind_and_missing_driver(client):
    driver = make_driver(client)
    assert upload(client, driver["id"], "selfie", PDF_BYTES).status_code == 404
    assert upload(client, 999, "aadhaarProof", PDF_BYTES).status_code == 404


def test_replace_and_remove_a_file(client):
    driver = make_driver(client)
    upload(client, driver["id"], "aadhaarProof", PDF_BYTES, "old.pdf")
    upload(client, driver["id"], "aadhaarProof", PDF_BYTES + b"more", "new.pdf")
    got = client.get(f"{API}/drivers/{driver['id']}").json()
    assert got["files"]["aadhaarProof"]["filename"] == "new.pdf"

    assert client.delete(f"{API}/drivers/{driver['id']}/files/aadhaarProof").status_code == 204
    assert client.get(f"{API}/drivers/{driver['id']}/files/aadhaarProof").status_code == 404


def test_update_and_delete_driver_removes_files(client, tmp_path):
    driver = make_driver(client)
    upload(client, driver["id"], "aadhaarProof", PDF_BYTES)
    folder = tmp_path / "uploads" / "driver" / str(driver["id"])
    assert folder.exists()

    updated = client.put(f"{API}/drivers/{driver['id']}", json={**DRIVER, "fixedHireAmount": 20000})
    assert updated.json()["fixedHireAmount"] == 20000
    assert "aadhaarProof" in updated.json()["files"]  # files survive an update

    assert client.delete(f"{API}/drivers/{driver['id']}").status_code == 204
    assert not folder.exists()
    assert client.get(f"{API}/drivers/{driver['id']}").status_code == 404
