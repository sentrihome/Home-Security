"""Unit tests for Drive token store + upload wiring.

No Google network, no camera. HTTP is mocked; the encrypted-at-rest store
uses a temp directory so tests never touch the Pi's real token file.

Run from rasberry-pi-setup/:
    python3 -m unittest discover -s tests -v
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pi_hub import config, drive  # noqa: E402


class DriveTestCase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self._orig = {
            "DATA_DIR": config.DATA_DIR,
            "DRIVE_TOKEN_PATH": config.DRIVE_TOKEN_PATH,
            "DRIVE_KEY_PATH": config.DRIVE_KEY_PATH,
        }
        config.DATA_DIR = root
        config.DRIVE_TOKEN_PATH = root / "drive_token.json.enc"
        config.DRIVE_KEY_PATH = root / ".drive_key"
        drive._access_token = None
        drive._access_expires_at = 0.0
        drive._last_upload = None
        drive._last_error = None

    def tearDown(self):
        config.DATA_DIR = self._orig["DATA_DIR"]
        config.DRIVE_TOKEN_PATH = self._orig["DRIVE_TOKEN_PATH"]
        config.DRIVE_KEY_PATH = self._orig["DRIVE_KEY_PATH"]
        drive._access_token = None
        drive._access_expires_at = 0.0

    def _store(self, **kwargs):
        body = {
            "refresh_token": "rt-test",
            "email": "owner@example.com",
            "client_id": "cid.apps.googleusercontent.com",
            "client_secret": "csecret",
        }
        body.update(kwargs)
        return drive.store_token(**body)


class StoreTokenTest(DriveTestCase):
    def test_requires_refresh_or_auth_code(self):
        result = drive.store_token(
            email="a@b.c", client_id="cid", client_secret="sec"
        )
        self.assertFalse(result["ok"])
        self.assertIn("refresh_token", result["error"])

    def test_requires_oauth_client(self):
        result = drive.store_token(
            refresh_token="rt", email="a@b.c"
        )
        self.assertFalse(result["ok"])
        self.assertIn("client_id", result["error"])

    def test_stores_encrypted_not_plaintext(self):
        result = self._store()
        self.assertTrue(result["ok"])
        self.assertTrue(config.DRIVE_TOKEN_PATH.exists())
        raw = config.DRIVE_TOKEN_PATH.read_bytes()
        self.assertFalse(raw.lstrip().startswith(b"{"))
        self.assertNotIn(b"rt-test", raw)
        loaded = drive.load_token()
        self.assertEqual(loaded["refresh_token"], "rt-test")
        self.assertEqual(loaded["email"], "owner@example.com")
        self.assertTrue(drive.has_token())

    def test_status_never_returns_secrets(self):
        self._store()
        st = drive.status()
        dumped = json.dumps(st)
        self.assertNotIn("rt-test", dumped)
        self.assertNotIn("csecret", dumped)
        self.assertTrue(st["linked"])
        self.assertEqual(st["email"], "owner@example.com")

    def test_clear_token(self):
        self._store()
        drive.clear_token()
        self.assertFalse(drive.has_token())
        self.assertFalse(config.DRIVE_TOKEN_PATH.exists())

    def test_migrates_legacy_plaintext(self):
        config.DRIVE_TOKEN_PATH.write_text(
            json.dumps(
                {
                    "email": "old@example.com",
                    "refresh_token": "legacy-rt",
                    "client_id": "cid",
                    "client_secret": "sec",
                }
            )
        )
        loaded = drive.load_token()
        self.assertEqual(loaded["refresh_token"], "legacy-rt")
        raw = config.DRIVE_TOKEN_PATH.read_bytes()
        self.assertFalse(raw.lstrip().startswith(b"{"))


class UploadClipTest(DriveTestCase):
    def test_missing_file(self):
        result = drive.upload_clip(Path(self.tmp.name) / "nope.mp4")
        self.assertFalse(result["ok"])
        self.assertIn("not found", result["error"])

    def test_no_token(self):
        clip = Path(self.tmp.name) / "clip-1.mp4"
        clip.write_bytes(b"\x00" * 64)
        result = drive.upload_clip(clip)
        self.assertFalse(result["ok"])
        self.assertIn("no Drive token", result["error"])

    def test_token_without_client_id_does_not_crash(self):
        drive._encrypt_payload(
            {"email": "a@b.c", "refresh_token": "rt-only"}
        )
        clip = Path(self.tmp.name) / "clip-1.mp4"
        clip.write_bytes(b"\x00" * 64)
        result = drive.upload_clip(clip)
        self.assertFalse(result["ok"])
        self.assertIn("client_id", result["error"])
        self.assertIn("client_id", drive.status()["error"])

    def test_upload_happy_path(self):
        self._store()
        clip = Path(self.tmp.name) / "clip-20260101-120000.mp4"
        clip.write_bytes(b"\x00fake-mp4\x00" * 32)

        def fake_http(url, method="GET", headers=None, data=None, timeout=30):
            if "oauth2.googleapis.com/token" in url:
                return 200, {"access_token": "at-test", "expires_in": 3600}
            if "drive/v3/files" in url and "uploadType" not in url and method == "GET":
                return 200, {"files": []}
            if "drive/v3/files" in url and method == "POST" and "uploadType" not in url:
                return 200, {"id": "folder-1", "name": "SentriHome"}
            if "upload/drive/v3/files" in url:
                return 200, {
                    "id": "file-99",
                    "name": clip.name,
                    "webViewLink": "https://drive.google.com/file/d/file-99/view",
                }
            return 500, {"error": "unexpected " + url}

        with patch("pi_hub.drive._http_json", side_effect=fake_http):
            result = drive.upload_clip(clip)

        self.assertTrue(result["ok"], result)
        self.assertEqual(result["file_id"], "file-99")
        self.assertEqual(result["folder_id"], "folder-1")
        self.assertEqual(drive.status()["last_upload"]["file_id"], "file-99")

    def test_revoked_refresh_token_fails_loudly(self):
        self._store()
        clip = Path(self.tmp.name) / "clip-x.mp4"
        clip.write_bytes(b"x" * 64)

        def fake_http(url, method="GET", headers=None, data=None, timeout=30):
            return 400, {
                "error": "invalid_grant",
                "error_description": "Token has been expired or revoked.",
            }

        with patch("pi_hub.drive._http_json", side_effect=fake_http):
            result = drive.upload_clip(clip)

        self.assertFalse(result["ok"])
        self.assertIn("invalid_grant", result["error"])
        self.assertIn("invalid_grant", drive.status()["error"])


class AuthCodeExchangeTest(DriveTestCase):
    def test_auth_code_path_stores_refresh_token(self):
        def fake_http(url, method="GET", headers=None, data=None, timeout=30):
            if "oauth2.googleapis.com/token" in url:
                return 200, {
                    "refresh_token": "rt-from-code",
                    "access_token": "at",
                    "expires_in": 3600,
                }
            if "oauth2/v2/userinfo" in url:
                return 200, {"email": "from-google@example.com"}
            return 500, {"error": url}

        with patch("pi_hub.drive._http_json", side_effect=fake_http):
            result = drive.store_token(
                auth_code="4/abc",
                client_id="cid",
                client_secret="sec",
                redirect_uri="homesecurity://oauth",
            )

        self.assertTrue(result["ok"], result)
        self.assertEqual(result["email"], "from-google@example.com")
        self.assertEqual(drive.load_token()["refresh_token"], "rt-from-code")

    def test_auth_code_without_refresh_token_explains_consent(self):
        def fake_http(url, method="GET", headers=None, data=None, timeout=30):
            return 200, {"access_token": "at", "expires_in": 3600}

        with patch("pi_hub.drive._http_json", side_effect=fake_http):
            result = drive.store_token(
                auth_code="4/abc",
                client_id="cid",
                client_secret="sec",
                redirect_uri="homesecurity://oauth",
                email="x@y.z",
            )

        self.assertFalse(result["ok"])
        self.assertIn("one-time", result["hint"])

    def test_refresh_token_skips_spent_auth_code(self):
        def fake_http(url, method="GET", headers=None, data=None, timeout=30):
            raise AssertionError("must not exchange auth_code when refresh_token is present")

        with patch("pi_hub.drive._http_json", side_effect=fake_http):
            result = drive.store_token(
                refresh_token="1//rt-already",
                auth_code="4/already-used",
                email="a@b.c",
                client_id="cid",
                client_secret="sec",
            )

        self.assertTrue(result["ok"], result)
        self.assertEqual(drive.load_token()["refresh_token"], "1//rt-already")


if __name__ == "__main__":
    unittest.main()
