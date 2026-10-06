from tests.conftest import PDF_BYTES

from app.core.security import hash_password, verify_password

API = "/api/v1"

STAFF = {
    "name": "Anita Menon",
    "staffId": "STF-1003",
    "department": "Operations",
    "designation": "Operations Manager",
    "dateOfBirth": "1990-07-21",
    "dateOfJoining": "2022-01-10",
    "email": "Anita.Menon@Company.com",
    "contactNumber": "+91 90000 00000",
    "softwareDesignation": "Trip Sheet Register",
    "password": "s3cret-pass",
    "address": "5 Lake View, Kochi",
    "aadharNumber": "123456789012",
}


def make_staff(client, **overrides):
    response = client.post(f"{API}/staff", json={**STAFF, **overrides})
    assert response.status_code == 201, response.text
    return response.json()


def test_create_staff_sets_username_and_never_returns_the_password(client):
    member = make_staff(client)
    assert member["username"] == "anita.menon@company.com"
    assert "password" not in member and "passwordHash" not in member
    assert member["missingFiles"] == ["aadharCard"]


def test_password_is_stored_hashed():
    stored = hash_password("s3cret-pass")
    assert stored.startswith("scrypt$") and "s3cret-pass" not in stored
    assert verify_password("s3cret-pass", stored)
    assert not verify_password("wrong", stored)
    assert hash_password("s3cret-pass") != stored  # random salt


def test_staff_validation(client):
    bad = {
        "password": "short",
        "email": "not-an-email",
        "aadharNumber": "123",
        "softwareDesignation": "Something Else",
        "dateOfBirth": "2999-01-01",
        "staffId": "",
    }
    for field, value in bad.items():
        assert client.post(f"{API}/staff", json={**STAFF, field: value}).status_code == 422, field


def test_aadhar_number_is_optional(client):
    assert make_staff(client, aadharNumber="")["aadharNumber"] == ""


def test_staff_id_and_email_must_be_unique(client):
    make_staff(client)
    assert client.post(f"{API}/staff", json={**STAFF, "email": "other@company.com"}).status_code == 409  # same staffId
    assert client.post(f"{API}/staff", json={**STAFF, "staffId": "STF-2000", "email": "ANITA.MENON@company.com"}).status_code == 409


def test_update_keeps_password_unless_a_new_one_is_given(client):
    member = make_staff(client)
    no_password = {k: v for k, v in STAFF.items() if k != "password"}
    changed = client.put(f"{API}/staff/{member['id']}", json={**no_password, "designation": "Director"})
    assert changed.status_code == 200 and changed.json()["designation"] == "Director"
    assert client.put(f"{API}/staff/{member['id']}", json={**no_password, "password": "short"}).status_code == 422
    assert client.put(f"{API}/staff/{member['id']}", json={**no_password, "password": "brand-new-pass"}).status_code == 200


def test_aadhar_card_upload_and_delete(client, tmp_path):
    member = make_staff(client)
    uploaded = client.put(f"{API}/staff/{member['id']}/files/aadharCard", files={"file": ("aadhar.pdf", PDF_BYTES)})
    assert uploaded.status_code == 200
    assert client.get(f"{API}/staff/{member['id']}").json()["missingFiles"] == []

    folder = tmp_path / "uploads" / "staff" / str(member["id"])
    assert folder.exists()
    assert client.delete(f"{API}/staff/{member['id']}").status_code == 204
    assert not folder.exists()
