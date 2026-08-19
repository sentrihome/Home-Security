"""Tests for the Pi /dev portal OAuth helpers (no Google, no Flask server)."""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from pathlib import Path
from urllib.parse import parse_qs, urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from pi_hub import config, portal  # noqa: E402


class PortalTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name)
        self._orig = {
            "DATA_DIR": config.DATA_DIR,
            "DRIVE_OAUTH_CLIENT_PATH": config.DRIVE_OAUTH_CLIENT_PATH,
        }
        config.DATA_DIR = root
        config.DRIVE_OAUTH_CLIENT_PATH = root / "drive_oauth_client.json"
        portal._pending.clear()

    def tearDown(self):
        config.DATA_DIR = self._orig["DATA_DIR"]
        config.DRIVE_OAUTH_CLIENT_PATH = self._orig["DRIVE_OAUTH_CLIENT_PATH"]
        portal._pending.clear()

    def test_save_and_suffix(self):
        result = portal.save_oauth_client(
            "123456.apps.googleusercontent.com", "secret"
        )
        self.assertTrue(result["ok"])
        self.assertEqual(portal.client_id_suffix(), ".com")
        loaded = portal.load_oauth_client()
        self.assertEqual(loaded["client_secret"], "secret")
        self.assertEqual(config.DRIVE_OAUTH_CLIENT_PATH.stat().st_mode & 0o777, 0o600)

    def test_start_login_requires_client(self):
        result = portal.start_login("http://192.168.0.236:4000/dev/drive/callback")
        self.assertFalse(result["ok"])

    def test_authorize_url_has_offline_consent_and_pkce(self):
        portal.save_oauth_client("cid.apps.googleusercontent.com", "sec")
        redirect = "http://192.168.0.236:4000/dev/drive/callback"
        started = portal.start_login(redirect)
        self.assertTrue(started["ok"], started)
        parts = urlparse(started["url"])
        q = parse_qs(parts.query)
        self.assertEqual(q["access_type"], ["offline"])
        self.assertEqual(q["prompt"], ["consent"])
        self.assertEqual(q["redirect_uri"], [redirect])
        self.assertIn("drive.file", q["scope"][0])
        self.assertEqual(q["code_challenge_method"], ["S256"])
        pending = portal.take_pending(started["state"])
        self.assertIsNotNone(pending)
        self.assertTrue(pending["code_verifier"])
        self.assertIsNone(portal.take_pending(started["state"]))

    def test_template_mentions_connect(self):
        path = Path(__file__).resolve().parents[1] / "pi_hub" / "templates" / "dev.html"
        html = path.read_text()
        self.assertIn("Connect Google Drive", html)
        self.assertIn("callback_uri", html)
