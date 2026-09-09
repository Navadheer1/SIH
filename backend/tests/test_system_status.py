import os
import sys
import unittest
from unittest.mock import patch, AsyncMock
from fastapi.testclient import TestClient

# Ensure backend directory is in sys.path
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.dirname(CURRENT_DIR)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app.main import app
import app.config as config


class TestSystemStatusEndpoint(unittest.TestCase):

    def setUp(self):
        self.client = TestClient(app)

    def test_01_health_endpoint_still_operational(self):
        """Verify GET /api/health continues to return healthy status and safe config summary."""
        resp = self.client.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "healthy")
        self.assertEqual(data["service"], "SIH 26162 Backend")
        self.assertIn("config", data)
        # Ensure no raw secrets in health check response
        self.assertNotIn("3099c83dc6cfcd209c2c73d4d188f13c", str(data))
        self.assertNotIn("YOUR_NASA_FIRMS_MAP_KEY", str(data))

    def test_02_system_status_default_configured(self):
        """Verify GET /api/system/status returns OPERATIONAL with CONFIGURED firms state when key is set."""
        with patch.object(config, "NASA_FIRMS_MAP_KEY", "test_mock_key_123"):
            resp = self.client.get("/api/system/status")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "OPERATIONAL")
            self.assertEqual(data["services"]["backend"], "UP")
            self.assertEqual(data["services"]["firms"], "CONFIGURED")
            self.assertIn("timestamp", data)
            self.assertEqual(data["environment"], "development")
            self.assertFalse(data["details"]["firms"]["connectivity_tested"])
            self.assertTrue(data["details"]["firms"]["configured"])
            # Ensure no secrets in response
            self.assertNotIn("test_mock_key_123", str(data))

    def test_03_system_status_not_configured(self):
        """Verify GET /api/system/status returns NOT_CONFIGURED when NASA_FIRMS_MAP_KEY is empty."""
        with patch.object(config, "NASA_FIRMS_MAP_KEY", ""):
            resp = self.client.get("/api/system/status")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "OPERATIONAL")
            self.assertEqual(data["services"]["firms"], "NOT_CONFIGURED")
            self.assertFalse(data["details"]["firms"]["configured"])

    def test_04_system_status_connectivity_check_reachable(self):
        """Verify check_connectivity=true probe returning HTTP 200 reports REACHABLE."""
        mock_res = {
            "status": "REACHABLE",
            "latency_ms": 142.5,
            "http_status": 200,
            "error_category": None
        }
        with patch("app.main.check_firms_connectivity", new=AsyncMock(return_value=mock_res)):
            with patch.object(config, "NASA_FIRMS_MAP_KEY", "valid_key_xyz"):
                resp = self.client.get("/api/system/status?check_connectivity=true")
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                self.assertEqual(data["status"], "OPERATIONAL")
                self.assertEqual(data["services"]["firms"], "REACHABLE")
                self.assertTrue(data["details"]["firms"]["connectivity_tested"])
                self.assertEqual(data["details"]["firms"]["latency_ms"], 142.5)
                self.assertEqual(data["details"]["firms"]["http_status"], 200)
                self.assertNotIn("valid_key_xyz", str(data))

    def test_05_system_status_connectivity_check_invalid_credential(self):
        """Verify check_connectivity=true probe when key is rejected reports INVALID_CREDENTIAL."""
        mock_res = {
            "status": "INVALID_CREDENTIAL",
            "latency_ms": 110.2,
            "http_status": 200,
            "error_category": "invalid_map_key"
        }
        with patch("app.main.check_firms_connectivity", new=AsyncMock(return_value=mock_res)):
            with patch.object(config, "NASA_FIRMS_MAP_KEY", "bad_key_123"):
                resp = self.client.get("/api/system/status?check_connectivity=true")
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                self.assertEqual(data["status"], "OPERATIONAL")
                self.assertEqual(data["services"]["firms"], "INVALID_CREDENTIAL")
                self.assertTrue(data["details"]["firms"]["connectivity_tested"])
                self.assertEqual(data["details"]["firms"]["error_category"], "invalid_map_key")
                self.assertNotIn("bad_key_123", str(data))

    def test_06_system_status_connectivity_check_unreachable(self):
        """Verify check_connectivity=true probe on timeout/network failure reports UNREACHABLE."""
        mock_res = {
            "status": "UNREACHABLE",
            "latency_ms": 5002.1,
            "http_status": None,
            "error_category": "timeout"
        }
        with patch("app.main.check_firms_connectivity", new=AsyncMock(return_value=mock_res)):
            with patch.object(config, "NASA_FIRMS_MAP_KEY", "some_key"):
                resp = self.client.get("/api/system/status?check_connectivity=true")
                self.assertEqual(resp.status_code, 200)
                data = resp.json()
                self.assertEqual(data["status"], "OPERATIONAL")
                self.assertEqual(data["services"]["firms"], "UNREACHABLE")
                self.assertTrue(data["details"]["firms"]["connectivity_tested"])
                self.assertEqual(data["details"]["firms"]["error_category"], "timeout")

    def test_07_no_api_key_leaks_anywhere_in_payload(self):
        """Ensure that regardless of parameters, no raw keys or substrings leak."""
        resp = self.client.get("/api/system/status")
        raw_text = resp.text
        self.assertNotIn("3099c83dc6cfcd209c2c73d4d188f13c", raw_text)
        self.assertNotIn("api_key", raw_text.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
