import asyncio
from datetime import datetime, timezone, timedelta
from unittest.mock import patch, MagicMock
import httpx
import pytest
from fastapi.testclient import TestClient

import app.config as config
from app.main import app
from app.services.satellite_service import (
    Sentinel2ImageProvider,
    classify_cloud_quality,
    CDSE_CATALOG_URL,
    CDSE_PROCESS_URL
)

client = TestClient(app)

SAMPLE_MULTI_CANDIDATE_CATALOG = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "id": "S2A_MSIL2A_20260905T051241_N0512_R019_T44QML_20260905T101626.SAFE",
            "bbox": [80.5, 22.6, 80.6, 22.7],
            "properties": {
                "datetime": "2026-09-05T05:22:43.024Z",
                "eo:cloud_cover": 92.5
            }
        },
        {
            "type": "Feature",
            "id": "S2B_MSIL2A_20260903T050649_N0512_R019_T44QML_20260903T100234.SAFE",
            "bbox": [80.5, 22.6, 80.6, 22.7],
            "properties": {
                "datetime": "2026-09-03T05:16:51.024Z",
                "eo:cloud_cover": 18.4
            }
        },
        {
            "type": "Feature",
            "id": "S2C_MSIL2A_20260901T051139_N0512_R019_T44QML_20260901T095812.SAFE",
            "bbox": [80.5, 22.6, 80.6, 22.7],
            "properties": {
                "datetime": "2026-09-01T05:21:40.024Z",
                "eo:cloud_cover": 45.0
            }
        }
    ]
}

SAMPLE_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"


def test_search_window_config_defaults():
    """Verify configurable search window variables exist and have positive values."""
    assert hasattr(config, "SATELLITE_SEARCH_BEFORE_HOURS")
    assert hasattr(config, "SATELLITE_SEARCH_AFTER_HOURS")
    assert config.SATELLITE_SEARCH_BEFORE_HOURS >= 24
    assert config.SATELLITE_SEARCH_AFTER_HOURS >= 12


def test_classify_cloud_quality():
    """Verify 4-tier optical atmospheric quality classification."""
    status_good, msg_good = classify_cloud_quality(15.0)
    assert status_good == "GOOD"
    assert "clear" in msg_good.lower()

    status_mod, msg_mod = classify_cloud_quality(45.0)
    assert status_mod == "MODERATE"

    status_high, msg_high = classify_cloud_quality(82.0)
    assert status_high == "HIGH_CLOUD"

    status_vhigh, msg_vhigh = classify_cloud_quality(95.0)
    assert status_vhigh == "VERY_HIGH_CLOUD"


def test_candidate_ranking_selects_optimal_scene(monkeypatch):
    """Verify multiple candidate scenes are scored and ranked with deterministic scoring."""
    provider = Sentinel2ImageProvider()

    async def mock_get_token(*args, **kwargs):
        return "test_valid_token"

    monkeypatch.setattr(provider.auth_service, "get_access_token", mock_get_token)

    async def mock_catalog_post(url, *args, **kwargs):
        return httpx.Response(
            status_code=200,
            json=SAMPLE_MULTI_CANDIDATE_CATALOG,
            request=httpx.Request("POST", str(url))
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_catalog_post):
        center_dt = datetime(2026, 9, 6, 14, 30, tzinfo=timezone.utc)
        candidates = asyncio.run(provider.search_catalog(
            lat=22.6789,
            lon=80.54321,
            bbox=(80.5, 22.6, 80.6, 22.7),
            center_dt=center_dt,
            before_hours=120,
            after_hours=48
        ))

        assert len(candidates) == 3
        # Candidate 2 (18.4% cloud cover) should rank higher than Candidate 1 (92.5% cloud cover)
        top_candidate = candidates[0]
        assert top_candidate["cloud_cover"] == 18.4
        assert top_candidate["quality_status"] == "GOOD"
        assert top_candidate["candidate_score"] > candidates[-1]["candidate_score"]


def test_high_cloud_scene_not_discarded(monkeypatch):
    """Verify when only high-cloud scenes are available, the real image is still returned with clear high-cloud status."""
    provider = Sentinel2ImageProvider()

    async def mock_get_token(*args, **kwargs):
        return "test_valid_token"

    monkeypatch.setattr(provider.auth_service, "get_access_token", mock_get_token)

    only_cloudy_catalog = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "id": "S2A_MSIL2A_HIGH_CLOUD.SAFE",
                "bbox": [80.5, 22.6, 80.6, 22.7],
                "properties": {
                    "datetime": "2026-09-06T05:22:43.024Z",
                    "eo:cloud_cover": 94.2
                }
            }
        ]
    }

    async def mock_router(url, *args, **kwargs):
        if str(url) == CDSE_CATALOG_URL:
            return httpx.Response(status_code=200, json=only_cloudy_catalog, request=httpx.Request("POST", str(url)))
        elif str(url) == CDSE_PROCESS_URL:
            return httpx.Response(status_code=200, content=SAMPLE_PNG_BYTES, request=httpx.Request("POST", str(url)))
        return httpx.Response(status_code=404, request=httpx.Request("POST", str(url)))

    with patch("httpx.AsyncClient.post", side_effect=mock_router):
        res = asyncio.run(provider.fetch_satellite_image(
            lat=22.6789,
            lon=80.54321,
            timestamp="2026-09-07 14:30 UTC",
            observation_id="obs_cloudy_test_999",
            force_refresh=True
        ))

        assert res["available"] is True
        assert res["image_available"] is True
        assert res["status"] == "ACQUISITION_AVAILABLE_HIGH_CLOUD"
        assert res["cloud_percentage"] == 94.2
        assert res["quality_status"] == "VERY_HIGH_CLOUD"
        assert "high cloud cover" in res["visual_evidence"].lower()


def test_no_acquisition_state_machine(monkeypatch):
    """Verify distinct NO_ACQUISITION state when 0 scenes intersect search window."""
    provider = Sentinel2ImageProvider()

    async def mock_get_token(*args, **kwargs):
        return "test_valid_token"

    monkeypatch.setattr(provider.auth_service, "get_access_token", mock_get_token)

    async def mock_empty(url, *args, **kwargs):
        return httpx.Response(
            status_code=200,
            json={"type": "FeatureCollection", "features": []},
            request=httpx.Request("POST", str(url))
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_empty):
        res = asyncio.run(provider.fetch_satellite_image(
            lat=10.0,
            lon=10.0,
            timestamp="2026-09-07 14:30 UTC",
            observation_id="obs_empty_test_000",
            force_refresh=True
        ))

        assert res["available"] is False
        assert res["image_available"] is False
        assert res["status"] == "NO_ACQUISITION"
        assert res["quality_status"] == "UNAVAILABLE"
        assert "no suitable sentinel-2" in res["message"].lower()


def test_satellite_diagnostics_endpoint(monkeypatch):
    """Verify GET /api/firms/{obs_id}/satellite-diagnostics endpoint returns transparent metrics."""
    provider = Sentinel2ImageProvider()

    async def mock_get_token(*args, **kwargs):
        return "test_valid_token"

    monkeypatch.setattr(provider.auth_service, "get_access_token", mock_get_token)

    async def mock_catalog_post(url, *args, **kwargs):
        return httpx.Response(
            status_code=200,
            json=SAMPLE_MULTI_CANDIDATE_CATALOG,
            request=httpx.Request("POST", str(url))
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_catalog_post):
        diag = asyncio.run(provider.get_satellite_diagnostics(
            lat=22.6789,
            lon=80.54321,
            timestamp="2026-09-07 14:30 UTC",
            observation_id="04e53a2f16d0d665"
        ))

        assert diag["observation_id"] == "04e53a2f16d0d665"
        assert diag["catalog_http_status"] == 200
        assert diag["catalog_results_count"] == 3
        assert len(diag["candidates"]) == 3
        assert diag["selected_scene"]["cloud_cover"] == 18.4
        assert diag["final_status"] == "ACQUISITION_AVAILABLE"
