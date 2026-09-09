import os
import json
import time
import asyncio
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import AsyncMock, patch, MagicMock
from fastapi.testclient import TestClient
import httpx

import app.config as config
from app.services.satellite_auth_service import (
    SatelliteAuthService,
    get_satellite_auth_service,
    CDSE_TOKEN_URL,
)
from app.services.satellite_service import (
    Sentinel2ImageProvider,
    get_satellite_provider,
    calculate_patch_bbox,
    generate_patch_id,
    CDSE_CATALOG_URL,
    CDSE_PROCESS_URL,
)
from app.services.evidence_fusion_service import fuse_thermal_evidence
from app.main import app

SAMPLE_STAC_CATALOG_RESPONSE = {
    "type": "FeatureCollection",
    "features": [
        {
            "type": "Feature",
            "id": "S2A_MSIL2A_20260907T053313_N0511_R105_T44QND_20260907T083421",
            "bbox": [78.4, 20.4, 78.7, 20.7],
            "properties": {
                "datetime": "2026-09-07T05:33:13.024Z",
                "platform": "sentinel-2a",
                "instruments": ["msi"],
                "constellation": "sentinel-2",
                "eo:cloud_cover": 12.5,
            }
        },
        {
            "type": "Feature",
            "id": "S2B_MSIL2A_20260906T052829_N0511_R105_T44QND_20260906T082015",
            "bbox": [78.4, 20.4, 78.7, 20.7],
            "properties": {
                "datetime": "2026-09-06T05:28:29.024Z",
                "platform": "sentinel-2b",
                "instruments": ["msi"],
                "constellation": "sentinel-2",
                "eo:cloud_cover": 45.0,
            }
        }
    ]
}

SAMPLE_PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xcf\xc0\x00\x00\x03\x01\x01\x00\x18\xdd\x8d\xb0\x00\x00\x00\x00IEND\xaeB`\x82"


@pytest.fixture
def auth_service():
    """Isolated instance of SatelliteAuthService."""
    svc = SatelliteAuthService()
    svc.clear_cached_token()
    return svc


@pytest.fixture
def sentinel_provider(tmp_path, monkeypatch):
    """Isolated instance of Sentinel2ImageProvider with isolated cache dir."""
    cache_dir = str(tmp_path / "satellite_cache")
    monkeypatch.setattr(config, "SATELLITE_CACHE_DIR", cache_dir)
    os.makedirs(cache_dir, exist_ok=True)
    provider = Sentinel2ImageProvider()
    provider.cache_dir = cache_dir
    return provider


def test_missing_copernicus_credentials(monkeypatch, auth_service, sentinel_provider):
    """Verify missing Copernicus credentials return available=False with clear reason."""
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_ID", "")
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_SECRET", "")

    assert not auth_service.is_configured()
    token = asyncio.run(auth_service.get_access_token())
    assert token is None

    res = asyncio.run(sentinel_provider.fetch_satellite_image(lat=21.12345, lon=79.12345, timestamp="2026-09-07 10:00 UTC"))
    assert res["available"] is False
    assert res["is_synthetic"] is False
    assert "unconfigured" in res["message"].lower()


def test_oauth_token_retrieval_and_caching(monkeypatch, auth_service):
    """Verify successful OAuth token retrieval and in-memory caching."""
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_ID", "mock_client_id")
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_SECRET", "mock_client_secret")

    call_count = 0

    async def mock_post(url, *args, **kwargs):
        nonlocal call_count
        call_count += 1
        return httpx.Response(
            status_code=200,
            json={"access_token": "mock_jwt_token_abc_123", "expires_in": 3600},
            request=httpx.Request("POST", url)
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_post):
        # 1st call -> performs HTTP post
        token1 = asyncio.run(auth_service.get_access_token())
        assert token1 == "mock_jwt_token_abc_123"
        assert call_count == 1

        # 2nd call -> returned from in-memory cache (call_count remains 1)
        token2 = asyncio.run(auth_service.get_access_token())
        assert token2 == "mock_jwt_token_abc_123"
        assert call_count == 1

        # Clear cache -> next call performs new HTTP post
        auth_service.clear_cached_token()
        token3 = asyncio.run(auth_service.get_access_token())
        assert token3 == "mock_jwt_token_abc_123"
        assert call_count == 2


def test_oauth_authentication_failure(monkeypatch, auth_service):
    """Verify handling of invalid Copernicus credentials (HTTP 401/403)."""
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_ID", "invalid_id")
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_SECRET", "invalid_secret")

    async def mock_post_fail(url, *args, **kwargs):
        return httpx.Response(
            status_code=401,
            json={"error": "unauthorized_client"},
            request=httpx.Request("POST", url)
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_post_fail):
        token = asyncio.run(auth_service.get_access_token())
        assert token is None

        conn_status = asyncio.run(auth_service.check_auth_connectivity())
        assert conn_status["status"] == "UNAVAILABLE"
        assert conn_status["error_category"] == "auth_rejected"


def test_catalog_search_success_and_cloud_sorting(monkeypatch, sentinel_provider):
    """Verify Catalog STAC search filters and sorts candidates by cloud cover."""
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_ID", "mock_id")
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_SECRET", "mock_secret")

    async def mock_get_token(*args, **kwargs):
        return "mock_token"

    monkeypatch.setattr(sentinel_provider.auth_service, "get_access_token", mock_get_token)

    async def mock_catalog_post(url, *args, **kwargs):
        return httpx.Response(
            status_code=200,
            json=SAMPLE_STAC_CATALOG_RESPONSE,
            request=httpx.Request("POST", url)
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_catalog_post):
        candidates = asyncio.run(sentinel_provider.search_catalog(
            lat=20.5,
            lon=78.5,
            bbox=(78.4, 20.4, 78.6, 20.6),
            center_dt=datetime(2026, 9, 7, 10, 0, tzinfo=timezone.utc),
            window_hours=48,
            max_cloud_cover=80.0
        ))
        assert len(candidates) == 2
        # Lowest cloud cover candidate should be first (12.5% < 45.0%)
        assert candidates[0]["cloud_cover"] == 12.5
        assert candidates[0]["id"] == "S2A_MSIL2A_20260907T053313_N0511_R105_T44QND_20260907T083421"


def test_no_imagery_available_data_integrity(monkeypatch, sentinel_provider):
    """Verify when no satellite pass exists, available=False and is_synthetic=False are returned."""
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_ID", "mock_id")
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_SECRET", "mock_secret")

    async def mock_get_token(*args, **kwargs):
        return "mock_token"

    monkeypatch.setattr(sentinel_provider.auth_service, "get_access_token", mock_get_token)

    async def mock_empty_catalog(url, *args, **kwargs):
        return httpx.Response(
            status_code=200,
            json={"type": "FeatureCollection", "features": []},
            request=httpx.Request("POST", url)
        )

    with patch("httpx.AsyncClient.post", side_effect=mock_empty_catalog):
        res = asyncio.run(sentinel_provider.fetch_satellite_image(
            lat=20.5,
            lon=78.5,
            timestamp="2026-09-07 10:00 UTC",
            observation_id="test_obs_no_sat"
        ))
        assert res["available"] is False
        assert res["is_synthetic"] is False
        assert res["source"] == "Copernicus Sentinel-2"
        assert res["product"] == "Sentinel-2 L2A"
        assert "no suitable sentinel-2" in res["message"].lower()


def test_real_imagery_retrieval_and_caching(monkeypatch, sentinel_provider):
    """Verify successful Processing API image retrieval and disk/db caching."""
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_ID", "mock_id")
    monkeypatch.setattr(config, "COPERNICUS_CLIENT_SECRET", "mock_secret")

    async def mock_get_token(*args, **kwargs):
        return "mock_token"

    monkeypatch.setattr(sentinel_provider.auth_service, "get_access_token", mock_get_token)

    async def mock_router_post(url, *args, **kwargs):
        if str(url) == CDSE_CATALOG_URL:
            return httpx.Response(
                status_code=200,
                json=SAMPLE_STAC_CATALOG_RESPONSE,
                request=httpx.Request("POST", str(url))
            )
        elif str(url) == CDSE_PROCESS_URL:
            return httpx.Response(
                status_code=200,
                content=SAMPLE_PNG_BYTES,
                headers={"Content-Type": "image/png"},
                request=httpx.Request("POST", str(url))
            )
        return httpx.Response(status_code=404, request=httpx.Request("POST", str(url)))

    with patch("httpx.AsyncClient.post", side_effect=mock_router_post):
        res = asyncio.run(sentinel_provider.fetch_satellite_image(
            lat=20.5,
            lon=78.5,
            timestamp="2026-09-07 10:00 UTC",
            observation_id="test_obs_success_123"
        ))
        assert res["available"] is True
        assert res["is_synthetic"] is False
        assert res["source"] == "Copernicus Sentinel-2"
        assert res["product"] == "Sentinel-2 L2A"
        assert res["cloud_percentage"] == 12.5
        assert res["image_path"] is not None
        assert os.path.exists(res["image_path"])
        assert res["true_color_available"] is True


def test_evidence_fusion_with_real_satellite_evidence():
    """Verify evidence fusion engine handles real Sentinel-2 evidence correctly."""
    spot_dict = {
        "observation_id": "test_obs_fuse",
        "latitude": 21.12345,
        "longitude": 79.12345,
        "frp": 35.0,
        "brightness": 345.0,
        "confidence": "high",
        "persistence_score": 75.0,
        "observation_count": 3,
        "duration_hours": 12.0
    }
    osm_ctx = {
        "context_classification": "INDUSTRIAL",
        "nearby_facility": "Thermal Power Plant",
        "distance_km": 0.4
    }
    sat_evidence = {
        "image_available": True,
        "is_synthetic": False,
        "classification": "INDUSTRIAL_FIRE",
        "confidence": 0.88,
        "source": "Copernicus Sentinel-2",
        "product": "Sentinel-2 L2A",
        "satellite_acquired_at": "2026-09-07 05:33:13 UTC",
        "cloud_percentage": 10.2,
        "image_url": "/api/satellite/image/sat_test_obs_fuse",
        "visual_evidence": "Optical patch confirms thermal signature over industrial facility."
    }

    fused = fuse_thermal_evidence(
        spot_dict=spot_dict,
        osm_context=osm_ctx,
        satellite_evidence=sat_evidence
    )
    assert fused["final_classification"] == "INDUSTRIAL_FIRE_CANDIDATE"
    assert fused["combined_confidence"] > 0.70
    assert fused["evidence"]["satellite"]["is_synthetic"] is False
    assert fused["evidence"]["satellite"]["source"] == "Copernicus Sentinel-2"


def test_system_status_api_reports_satellite():
    """Verify /api/system/status reports Copernicus satellite provider status."""
    client = TestClient(app)
    resp = client.get("/api/system/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "services" in data
    assert "satellite" in data["services"]
    assert "details" in data
    assert "satellite" in data["details"]
    assert data["details"]["satellite"]["provider"] == "Copernicus Sentinel Hub"


def test_zero_copernicus_secret_leak():
    """Verify client secrets and access tokens are never leaked in API payloads."""
    client = TestClient(app)
    resp = client.get("/api/system/status")
    text_payload = json.dumps(resp.json())
    if config.COPERNICUS_CLIENT_SECRET:
        assert config.COPERNICUS_CLIENT_SECRET not in text_payload


@pytest.mark.skipif(
    not os.getenv("RUN_COPERNICUS_SMOKE_TEST"),
    reason="Set RUN_COPERNICUS_SMOKE_TEST=true to run live Copernicus CDSE smoke test"
)
def test_live_copernicus_smoke_test():
    """
    Live Copernicus smoke test against real CDSE APIs.
    Only executed when RUN_COPERNICUS_SMOKE_TEST=true.
    Never exposes client credentials or tokens.
    """
    auth_svc = get_satellite_auth_service()
    assert auth_svc.is_configured(), "Copernicus credentials must be configured for smoke test."

    # 1. Live Auth
    token = asyncio.run(auth_svc.get_access_token())
    assert token is not None, "Copernicus authentication failed"
    assert len(token) > 20

    # 2. Live Provider Search & Processing
    provider = get_satellite_provider()
    # Test on central India coords (Nagpur area)
    res = asyncio.run(provider.fetch_satellite_image(
        lat=21.1458,
        lon=79.0882,
        timestamp="2026-09-07 10:00 UTC",
        observation_id="live_smoke_nagpur",
        force_refresh=True
    ))
    assert res["source"] == "Copernicus Sentinel-2"
    assert res["product"] == "Sentinel-2 L2A"
    assert res["is_synthetic"] is False
    if res["available"]:
        assert res["image_path"] is not None
        assert os.path.exists(res["image_path"])
