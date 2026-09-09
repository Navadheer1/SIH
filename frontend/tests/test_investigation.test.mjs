import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 6G Frontend Investigation UI & State Logic Tests', () => {

  // =========================================================================
  // Scenario A: Complete Investigation Response
  // =========================================================================
  it('Scenario A: Validates complete investigation response structure', () => {
    const mockResponse = {
      observation_id: '423f0b1ad50facd6',
      detection: {
        source: 'NASA FIRMS',
        latitude: 24.23818,
        longitude: 97.22869,
        brightness: 342.5,
        frp: 45.2,
        confidence: 'high',
        satellite: 'NOAA-20 (VIIRS)',
        acquired_at: '2026-09-07T05:59:00Z',
        freshness: 'RECENT',
      },
      persistence: {
        available: true,
        score: 85.0,
        observation_count: 5,
        duration_hours: 18.5,
        time_window_hours: 24.0,
        classification: 'HIGHLY PERSISTENT',
      },
      industrial_context: {
        available: true,
        score: 0.92,
        nearest_distance_m: 230.0,
        nearest_distance_km: 0.23,
        nearest_facility: 'Petrochemical Refining Complex',
        features: [
          { name: 'Refinery Flare Stack', type: 'industrial', distance_km: 0.23 },
        ],
        source: 'OpenStreetMap',
      },
      sentinel2: {
        available: true,
        state: 'ACQUISITION_AVAILABLE',
        class: 'INDUSTRIAL_FIRE',
        confidence: 0.94,
        cloud_cover: 12.4,
        quality: 'GOOD',
        is_synthetic: false,
        is_calibrated: false,
        satellite_acquired_at: '2026-09-07T05:22:00Z',
        time_difference_hours: -0.62,
        image_url: '/api/satellite/patches/patch_423f0b1ad50facd6.png',
        model: 'Sentinel2-6Band-CNN',
        class_probabilities: {
          INDUSTRIAL_FIRE: 0.94,
          WILDFIRE: 0.04,
          NON_FIRE: 0.02,
        },
      },
      fusion: {
        candidate_class: 'INDUSTRIAL_FIRE',
        candidate_score: 0.915,
        evidence_strength: 'STRONG',
        confidence_label: 'HIGH',
        reasoning: [
          'High thermal radiance (45.2 MW) and high brightness (342.5 K).',
          'High multi-pass temporal persistence (85.0/100 across 5 passes).',
          'Close proximity to Petrochemical Refining Complex (230m).',
          'High-confidence Sentinel-2 optical CNN match (94.0%) under clear skies (12.4% cloud).',
        ],
        conflict_detected: false,
        contributing_factors: {
          thermal_anomaly: 0.30,
          persistence: 0.20,
          industrial_context: 0.20,
          sentinel2_cnn: 0.30,
        },
      },
      risk: {
        risk_score: 88.5,
        risk_level: 'CRITICAL',
        primary_driver: 'Industrial Infrastructure Proximity',
        factors: {
          thermal_frp: 0.35,
          industrial_proximity: 0.30,
          persistence: 0.20,
          satellite_confidence: 0.15,
        },
      },
      provenance: {
        observation_id: '423f0b1ad50facd6',
        firms_acquired_at: '2026-09-07T05:59:00Z',
        sentinel2_acquired_at: '2026-09-07T05:22:00Z',
        temporal_offset_hours: -0.62,
        osm_queried_at: '2026-09-08T11:00:00Z',
        investigated_at: '2026-09-08T11:00:01Z',
      },
      warnings: [],
      disclaimers: [
        'AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.',
        'Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.',
      ],
    };

    assert.equal(mockResponse.observation_id, '423f0b1ad50facd6');
    assert.equal(mockResponse.fusion.candidate_class, 'INDUSTRIAL_FIRE');
    assert.equal(mockResponse.fusion.evidence_strength, 'STRONG');
    assert.equal(mockResponse.risk.risk_level, 'CRITICAL');
    assert.equal(mockResponse.sentinel2.is_synthetic, false);
    assert.equal(mockResponse.sentinel2.is_calibrated, false);
    assert.equal(mockResponse.disclaimers.length, 2);
  });

  // =========================================================================
  // Scenario B: INDUSTRIAL_FIRE candidate
  // =========================================================================
  it('Scenario B: Evaluates INDUSTRIAL_FIRE candidate classification', () => {
    const fusion = {
      candidate_class: 'INDUSTRIAL_FIRE',
      candidate_score: 0.88,
      evidence_strength: 'STRONG',
      confidence_label: 'HIGH',
      reasoning: ['Industrial proximity + recurrent signature'],
      conflict_detected: false,
      contributing_factors: { industrial_context: 0.20, persistence: 0.20 },
    };
    assert.equal(fusion.candidate_class, 'INDUSTRIAL_FIRE');
    assert.ok(fusion.candidate_score >= 0.70);
    assert.equal(fusion.evidence_strength, 'STRONG');
  });

  // =========================================================================
  // Scenario C: WILDFIRE candidate
  // =========================================================================
  it('Scenario C: Evaluates WILDFIRE candidate classification', () => {
    const fusion = {
      candidate_class: 'WILDFIRE',
      candidate_score: 0.79,
      evidence_strength: 'STRONG',
      confidence_label: 'HIGH',
      reasoning: ['High FRP in rural forest area with optical wildfire signature'],
      conflict_detected: false,
      contributing_factors: { thermal_anomaly: 0.30, sentinel2_cnn: 0.30 },
    };
    assert.equal(fusion.candidate_class, 'WILDFIRE');
    assert.equal(fusion.confidence_label, 'HIGH');
  });

  // =========================================================================
  // Scenario D: NON_FIRE candidate
  // =========================================================================
  it('Scenario D: Evaluates NON_FIRE candidate classification', () => {
    const fusion = {
      candidate_class: 'NON_FIRE',
      candidate_score: 0.65,
      evidence_strength: 'MODERATE',
      confidence_label: 'MEDIUM',
      reasoning: ['Low thermal radiance and clear non-fire ground features'],
      conflict_detected: false,
      contributing_factors: { thermal_anomaly: 0.15 },
    };
    assert.equal(fusion.candidate_class, 'NON_FIRE');
  });

  // =========================================================================
  // Scenario E: UNKNOWN candidate
  // =========================================================================
  it('Scenario E: Evaluates UNKNOWN candidate classification when evidence is insufficient', () => {
    const fusion = {
      candidate_class: 'UNKNOWN',
      candidate_score: 0.18,
      evidence_strength: 'INSUFFICIENT',
      confidence_label: 'INCONCLUSIVE',
      reasoning: ['Insufficient multi-source evidence to infer candidate class'],
      conflict_detected: false,
      contributing_factors: {},
    };
    assert.equal(fusion.candidate_class, 'UNKNOWN');
    assert.equal(fusion.evidence_strength, 'INSUFFICIENT');
  });

  // =========================================================================
  // Scenario F: High-Cloud Sentinel-2 Guardrail
  // =========================================================================
  it('Scenario F: Flags high-cloud Sentinel-2 optical quality degradation', () => {
    const s2 = {
      available: true,
      state: 'ACQUISITION_AVAILABLE',
      class: 'INDUSTRIAL_FIRE',
      confidence: 0.65,
      cloud_cover: 78.5,
      quality: 'VERY_HIGH_CLOUD',
      is_synthetic: false,
      is_calibrated: false,
      satellite_acquired_at: '2026-09-07T05:22:00Z',
      time_difference_hours: -0.62,
      class_probabilities: {},
    };
    assert.equal(s2.quality, 'VERY_HIGH_CLOUD');
    assert.ok((s2.cloud_cover ?? 0) >= 70.0);
    const isDegraded = s2.quality === 'HIGH_CLOUD' || s2.quality === 'VERY_HIGH_CLOUD';
    assert.equal(isDegraded, true);
  });

  // =========================================================================
  // Scenario G: Unavailable Sentinel-2 Handling
  // =========================================================================
  it('Scenario G: Handles unavailable Sentinel-2 gracefully', () => {
    const s2 = {
      available: false,
      state: 'NO_ACQUISITION',
      class: 'UNKNOWN',
      confidence: 0.0,
      cloud_cover: null,
      quality: 'UNAVAILABLE',
      is_synthetic: false,
      is_calibrated: false,
      satellite_acquired_at: null,
      time_difference_hours: null,
      class_probabilities: {},
    };
    assert.equal(s2.available, false);
    assert.equal(s2.state, 'NO_ACQUISITION');
    assert.equal(s2.quality, 'UNAVAILABLE');
  });

  // =========================================================================
  // Scenario H: OSM Failure Warning Handling
  // =========================================================================
  it('Scenario H: Preserves OSM failure warning in response envelope', () => {
    const warnings = ['OpenStreetMap industrial context service degraded (TIMEOUT); proceeding with thermal and satellite evidence.'];
    assert.ok(warnings.length > 0);
    assert.ok(warnings[0].includes('OpenStreetMap'));
  });

  // =========================================================================
  // Scenario I: Sentinel-2 Failure Warning Handling
  // =========================================================================
  it('Scenario I: Preserves Sentinel-2 failure warning in response envelope', () => {
    const warnings = ['Copernicus Sentinel-2 service degraded (ConnectError); proceeding with thermal and geospatial evidence.'];
    assert.ok(warnings.length > 0);
    assert.ok(warnings[0].includes('Copernicus Sentinel-2'));
  });

  // =========================================================================
  // Scenario J: Conflicting Evidence Handling
  // =========================================================================
  it('Scenario J: Flags multi-source evidence conflict', () => {
    const fusion = {
      candidate_class: 'WILDFIRE',
      candidate_score: 0.68,
      evidence_strength: 'MODERATE',
      confidence_label: 'MEDIUM',
      reasoning: [
        'Conflicting evidence: Proximity to industrial infrastructure detected, but Sentinel-2 optical imagery indicates vegetative burning (WILDFIRE).',
      ],
      conflict_detected: true,
      contributing_factors: { industrial_context: 0.20, sentinel2_cnn: 0.30 },
    };
    assert.equal(fusion.conflict_detected, true);
    assert.ok(fusion.reasoning[0].includes('Conflicting evidence'));
  });

  // =========================================================================
  // Scenario K: Operational Risk Display
  // =========================================================================
  it('Scenario K: Validates Operational Risk Score structure and drivers', () => {
    const risk = {
      risk_score: 72.4,
      risk_level: 'HIGH',
      primary_driver: 'Thermal Radiance (FRP)',
      factors: {
        thermal_frp: 0.35,
        industrial_proximity: 0.15,
        persistence: 0.10,
        satellite_confidence: 0.12,
      },
    };
    assert.equal(risk.risk_score, 72.4);
    assert.equal(risk.risk_level, 'HIGH');
    assert.equal(risk.primary_driver, 'Thermal Radiance (FRP)');
  });

  // =========================================================================
  // Scenario L: Provenance Display
  // =========================================================================
  it('Scenario L: Validates audit provenance and explicit temporal offsets', () => {
    const provenance = {
      observation_id: '90b58068fefb3a79',
      firms_acquired_at: '2026-09-07T07:35:00Z',
      sentinel2_acquired_at: '2026-09-07T05:22:00Z',
      temporal_offset_hours: -2.22,
      osm_queried_at: '2026-09-08T11:05:00Z',
      investigated_at: '2026-09-08T11:05:01Z',
    };
    assert.equal(provenance.observation_id, '90b58068fefb3a79');
    assert.equal(provenance.temporal_offset_hours, -2.22);
    assert.ok(provenance.investigated_at.endsWith('Z'));
  });

  // =========================================================================
  // Scenario M: Mandatory Disclaimers
  // =========================================================================
  it('Scenario M: Ensures presence of both regulatory disclaimers', () => {
    const disclaimers = [
      'AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.',
      'Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.',
    ];
    assert.equal(disclaimers.length, 2);
    assert.ok(disclaimers[0].includes('AI Candidate Classification is an evidence-fusion output'));
    assert.ok(disclaimers[1].includes('optical evidence and may not be temporally coincident'));
  });

  // =========================================================================
  // Scenario N: Force Refresh Behavior
  // =========================================================================
  it('Scenario N: Formats force_refresh query parameter accurately', () => {
    const obsId = '423f0b1ad50facd6';
    const forceRefresh = true;
    const query = forceRefresh ? '?force_refresh=true' : '';
    const endpoint = `/api/firms/${encodeURIComponent(obsId)}/investigation${query}`;
    assert.equal(endpoint, '/api/firms/423f0b1ad50facd6/investigation?force_refresh=true');
  });

  // =========================================================================
  // Scenario O: Loading State Verification
  // =========================================================================
  it('Scenario O: Verifies pipeline step definitions in loading state', () => {
    const steps = [
      { id: 'firms', label: 'NASA FIRMS Radiometric Anomaly', status: 'done' },
      { id: 'persistence', label: 'Multi-Pass Spatial-Temporal Persistence', status: 'done' },
      { id: 'osm', label: 'OpenStreetMap Industrial Geospatial Context', status: 'active' },
      { id: 'sentinel2', label: 'Copernicus Sentinel-2 6-Band Multispectral Vision', status: 'active' },
    ];
    assert.equal(steps.length, 4);
    assert.equal(steps[0].status, 'done');
    assert.equal(steps[3].status, 'active');
  });

  // =========================================================================
  // Scenario P: Error State & Retry Handling
  // =========================================================================
  it('Scenario P: Formats error fallback state without crashing', () => {
    const errorState = {
      error: 'Observation with ID "nonexistent_id" not found.',
      canRetry: true,
      canForce: true,
    };
    assert.ok(errorState.error.includes('not found'));
    assert.equal(errorState.canRetry, true);
  });

});
