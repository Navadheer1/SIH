"""
Phase 2 Unit and Integration Tests: Impact Intelligence & Dynamic Threat Assessment
"""

import unittest
import httpx
from app.services.threat_zone_service import calculate_threat_zones
from app.services.asset_exposure_service import categorize_asset_type, analyze_asset_exposure
from app.services.impact_service import calculate_impact_assessment
from app.main import app

class TestPhase2ImpactIntelligence(unittest.TestCase):

    def setUp(self):
        self.client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30.0)


    def tearDown(self):
        self.client.close()


    def test_01_dynamic_threat_zone_scaling(self):
        """Verify dynamic threat zone radii calculation based on FRP and risk score."""
        tz_low = calculate_threat_zones(frp=5.0, risk_score=20.0)
        tz_high = calculate_threat_zones(frp=65.0, risk_score=85.0, classification="INDUSTRIAL_FIRE")

        inner_low = tz_low["zones"]["inner_zone"]["radius_km"]
        inner_high = tz_high["zones"]["inner_zone"]["radius_km"]

        self.assertGreater(inner_high, inner_low)
        self.assertIn("AI-generated risk/impact assessment zones", tz_low["disclaimer"])

    def test_02_asset_categorization(self):
        """Verify OSM features are correctly mapped to 7 standardized asset classes."""
        self.assertEqual(categorize_asset_type("Apollo Hospital", "urban", "healthcare"), "HEALTHCARE")
        self.assertEqual(categorize_asset_type("Saint Mary School", "urban", "education"), "EDUCATION")
        self.assertEqual(categorize_asset_type("IOCL Oil Refinery", "industrial", "refinery"), "INDUSTRIAL")
        self.assertEqual(categorize_asset_type("National Highway 16", "road", "transport"), "TRANSPORT")
        self.assertEqual(categorize_asset_type("Substation 220kV", "power", "utility"), "UTILITIES")

    def test_03_asset_exposure_analysis(self):
        """Verify asset distance, zone placement, and exposure rating."""
        sample_features = [
            {"name": "City Hospital", "type": "urban", "category": "healthcare", "latitude": 16.51, "longitude": 80.64, "distance_km": 0.6},
            {"name": "Tech Factory", "type": "industrial", "category": "factory", "latitude": 16.53, "longitude": 80.66, "distance_km": 2.2}
        ]
        tz = calculate_threat_zones(frp=30.0, risk_score=70.0)
        analysis = analyze_asset_exposure(16.50, 80.63, sample_features, tz)

        self.assertEqual(analysis["total_exposed_assets"], 2)
        self.assertEqual(analysis["critical_infrastructure_count"], 2)
        self.assertIsNotNone(analysis["nearest_critical_asset"])
        self.assertEqual(analysis["nearest_critical_asset"]["asset_name"], "City Hospital")

    def test_04_impact_score_and_priority_index(self):
        """Verify Impact Score normalization (0-100) and Priority Index (P1-P4)."""
        asset_analysis = {
            "total_exposed_assets": 5,
            "critical_infrastructure_count": 3,
            "category_counts": {"HEALTHCARE": 1, "INDUSTRIAL": 2, "TRANSPORT": 2},
            "nearest_critical_asset": {"distance_km": 1.2, "asset_name": "District Hospital"}
        }

        res = calculate_impact_assessment(
            frp=45.0,
            risk_score=80.0,
            persistence_score=75.0,
            asset_analysis=asset_analysis,
            classification="INDUSTRIAL_FIRE"
        )

        self.assertGreaterEqual(res["impact_score"], 0.0)
        self.assertLessEqual(res["impact_score"], 100.0)
        self.assertEqual(res["priority_index"], "P1")
        self.assertIn("CRITICAL", res["priority_label"])
        self.assertGreater(len(res["explainable_reasons"]), 0)

    def test_05_api_incidents_impact_endpoint(self):
        """Test GET /api/incidents/impact endpoint."""
        resp = self.client.get("/api/incidents/impact?lat=16.5&lon=80.6&frp=35.0&risk_score=75.0")
        self.assertEqual(resp.status_code, 200)
        json_data = resp.json()
        self.assertIn("threat_zones", json_data)
        self.assertIn("asset_analysis", json_data)
        self.assertIn("impact_assessment", json_data)

    def test_06_api_incidents_priority_endpoint(self):
        """Test GET /api/incidents/priority endpoint."""
        resp = self.client.get("/api/incidents/priority?region=india&limit=5")
        self.assertEqual(resp.status_code, 200)
        json_data = resp.json()
        self.assertIn("priority_incidents", json_data)


if __name__ == "__main__":
    unittest.main()
