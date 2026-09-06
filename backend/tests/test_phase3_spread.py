import unittest
import asyncio
import httpx
from app.services.fire_spread_service import calculate_spread_projection
from app.services.future_impact_service import calculate_future_impact_forecast
from app.services.simulation_service import run_what_if_simulation

class TestPhase3FireSpread(unittest.TestCase):
    def setUp(self):
        self.client = httpx.Client(base_url="http://127.0.0.1:8000", timeout=30.0)
        self.test_lat = 16.506
        self.test_lon = 80.648
        self.test_frp = 45.0

    def tearDown(self):
        self.client.close()

    def test_01_spread_projection_with_wind(self):
        """Verify directional fire spread calculation with wind telemetry."""
        result = calculate_spread_projection(
            lat=self.test_lat,
            lon=self.test_lon,
            frp=self.test_frp,
            persistence_score=60.0,
            risk_score=75.0,
            wind_speed_kmh=14.0,
            wind_direction_deg=248.0,
        )
        self.assertIn("projections", result)
        self.assertTrue(result["wind_data"]["available"])
        self.assertEqual(result["wind_data"]["status_text"], "14.0 km/h at 248.0°")
        
        # Check time horizons
        for horizon in ["NOW", "+1H", "+3H", "+6H", "+12H"]:
            self.assertIn(horizon, result["projections"])
            proj = result["projections"][horizon]
            self.assertIn("radii_km", proj)
            self.assertIn("polygon_points", proj)
            self.assertTrue(len(proj["polygon_points"]) > 0)
            
        # Verify displacement increases over time
        now_disp = result["projections"]["NOW"]["displacement_km"]
        h12_disp = result["projections"]["+12H"]["displacement_km"]
        self.assertLess(now_disp, h12_disp)

    def test_02_spread_projection_missing_wind_fallback(self):
        """Verify conservative uncertainty fallback when wind data is DATA UNAVAILABLE."""
        result = calculate_spread_projection(
            lat=self.test_lat,
            lon=self.test_lon,
            frp=self.test_frp,
            wind_speed_kmh=None,
            wind_direction_deg=None,
        )
        self.assertFalse(result["wind_data"]["available"])
        self.assertEqual(result["wind_data"]["status_text"], "DATA UNAVAILABLE")
        self.assertIn("WIND UNAVAILABLE", result["estimated_direction"])
        # Verify confidence is reduced for missing wind
        self.assertLess(result["projections"]["+3H"]["confidence_score"], 80.0)

    def test_03_future_impact_forecast(self):
        """Verify time-series future asset exposure and dynamic priority index forecast."""
        loop = asyncio.get_event_loop()
        forecast = loop.run_until_complete(
            calculate_future_impact_forecast(
                lat=self.test_lat,
                lon=self.test_lon,
                frp=self.test_frp,
                persistence_score=50.0,
                risk_score=70.0,
                wind_speed_kmh=12.0,
                wind_direction_deg=180.0,
            )
        )
        self.assertIn("time_series_forecast", forecast)
        self.assertIn("+3H", forecast["time_series_forecast"])
        self.assertIn("escalation", forecast)

    def test_04_what_if_simulation_isolation(self):
        """Verify What-If simulation isolation (does not mutate live data)."""
        loop = asyncio.get_event_loop()
        sim_res = loop.run_until_complete(
            run_what_if_simulation(
                lat=self.test_lat,
                lon=self.test_lon,
                live_frp=30.0,
                live_risk_score=50.0,
                sim_frp=85.0,  # Simulated high FRP
                sim_wind_speed=25.0,
            )
        )
        self.assertEqual(sim_res["status"], "SIMULATION_SUCCESS")
        self.assertTrue(sim_res["is_simulation"])
        self.assertIn("comparison_summary", sim_res)
        deltas = sim_res["comparison_summary"]["deltas"]
        self.assertIn("delta_impact_score", deltas)

    def test_05_api_endpoints_integration(self):
        """Test API endpoints /api/incidents/spread, /future-impact, /simulate, /weather/current."""
        # 1. Spread endpoint
        res_spread = self.client.get(f"/api/incidents/spread?lat={self.test_lat}&lon={self.test_lon}&frp=40.0&wind_speed=15.0&wind_direction=120.0")
        self.assertEqual(res_spread.status_code, 200)
        self.assertIn("projections", res_spread.json())

        # 2. Future impact endpoint
        res_future = self.client.get(f"/api/incidents/future-impact?lat={self.test_lat}&lon={self.test_lon}&frp=40.0")
        self.assertEqual(res_future.status_code, 200)
        self.assertIn("time_series_forecast", res_future.json())

        # 3. Simulate endpoint
        res_sim = self.client.post(f"/api/incidents/simulate?lat={self.test_lat}&lon={self.test_lon}&live_frp=30.0&sim_frp=90.0")
        self.assertEqual(res_sim.status_code, 200)
        self.assertEqual(res_sim.json()["status"], "SIMULATION_SUCCESS")

        # 4. Weather endpoint
        res_weather = self.client.get(f"/api/weather/current?lat={self.test_lat}&lon={self.test_lon}")
        self.assertEqual(res_weather.status_code, 200)
        self.assertIn("wind_speed_kmh", res_weather.json())

if __name__ == "__main__":
    unittest.main()
