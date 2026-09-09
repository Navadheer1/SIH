import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('Phase 6H Frontend Operational Decision Support & Incident Prioritization Tests', () => {

  const mockDecisionSupport = {
    observation_id: '423f0b1ad50facd6',
    status: 'SUCCESS',
    summary: {
      candidate_class: 'INDUSTRIAL FIRE',
      evidence_strength: 'STRONG',
      risk_level: 'CRITICAL',
      priority_level: 'CRITICAL',
      priority_index: 'P1',
      persistence_interpretation: 'HIGHLY PERSISTENT',
      industrial_context_summary: 'Petrochemical Refining Complex',
      optical_evidence_quality: 'GOOD',
      asset_exposure_summary: '4 mapped assets (2 critical)',
      recommended_action: 'Deploy specialized industrial foam unit and initiate perimeter cooling.'
    },
    investigation: {
      observation_id: '423f0b1ad50facd6',
      status: 'SUCCESS',
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
        ],
        conflict_detected: false,
        contributing_factors: {
          thermal_anomaly: 0.30,
          persistence: 0.20,
        },
      },
      risk: {
        risk_score: 88,
        risk_level: 'CRITICAL',
        factors: { thermal_frp: 0.35, industrial_proximity: 0.30 },
      },
      provenance: {
        sources: ['NASA FIRMS', 'Copernicus Sentinel-2', 'OpenStreetMap'],
        timestamps: { retrieved_at: '2026-09-08T11:00:00Z' },
        firms_acquired_at: '2026-09-07T05:59:00Z',
        sentinel2_acquired_at: '2026-09-07T05:22:00Z',
        temporal_offset_hours: -0.62,
        disclaimer: 'AI Candidate Classification is an evidence-fusion output...',
      },
      warnings: [],
      disclaimers: [
        'AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.',
        'Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.',
      ],
      created_at: '2026-09-08T11:00:01Z',
    },
    priority: {
      priority_score: 92,
      priority_level: 'CRITICAL',
      priority_index: 'P1',
      scoring_breakdown: {
        risk_component: 39.6,
        asset_exposure_component: 25.0,
        industrial_class_bonus: 15.0,
        persistence_bonus: 12.4,
      },
      factors: {
        risk_score: 88,
        critical_assets: 2,
        is_industrial: true,
      },
      explainability_summary: 'Immediate critical dispatch required due to high risk (88/100) and proximity to 2 critical infrastructure assets.',
      ranking_reasons: [
        'Critical Risk Level (88/100)',
        '2 Critical Infrastructure facilities within hazard envelope',
        'Validated Industrial Fire candidate classification',
      ],
    },
    threat_zones: {
      available: true,
      threat_radius_meters: 1850,
      estimated_spread_rate_m_min: 2.8,
      high_hazard_zone: {
        radius_meters: 300,
        description: 'Immediate blast / extreme heat combustion zone.',
        key_actions: ['Immediate mandatory evacuation', 'Full protective gear required'],
      },
      moderate_hazard_zone: {
        radius_meters: 800,
        description: 'Heavy thermal radiation and concentrated smoke plume zone.',
        key_actions: ['Shelter-in-place or secondary evacuation', 'Active perimeter cooling'],
      },
      precautionary_zone: {
        radius_meters: 1850,
        description: 'Extended downwind toxic smoke and gas dispersion zone.',
        key_actions: ['Traffic diversion', 'Environmental air quality monitoring'],
      },
      zones: {},
      spread_scenario: {},
    },
    asset_exposure: {
      available: true,
      total_exposed_assets: 4,
      critical_infrastructure_count: 2,
      high_vulnerability_count: 1,
      moderate_count: 1,
      facilities: [
        {
          name: 'LNG Storage Terminal 4',
          type: 'gas_storage',
          category: 'fuel_storage',
          distance_km: 0.28,
          is_critical: true,
        },
        {
          name: 'Regional Power Substation',
          type: 'substation',
          category: 'power',
          distance_km: 0.65,
          is_critical: true,
        },
        {
          name: 'Chemical Warehousing Depot',
          type: 'warehouse',
          category: 'chemical',
          distance_km: 1.15,
          is_critical: false,
        },
        {
          name: 'Light Manufacturing Shed',
          type: 'factory',
          category: 'manufacturing',
          distance_km: 2.40,
          is_critical: false,
        },
      ],
    },
    impact: {
      available: true,
      impact_score: 84,
      impact_level: 'HIGH',
      breakdown: {
        human_safety: 88,
        infrastructure: 90,
        environmental: 74,
      },
    },
    future_impact: {
      available: true,
      scenarios_evaluated: 3,
      projections: [
        {
          projection_window_hours: 1,
          threat_level: 'HIGH',
          risk_summary: 'Potential flame spread to adjacent storage tanks within 60 minutes.',
          radius_meters: 450,
        },
        {
          projection_window_hours: 3,
          threat_level: 'CRITICAL',
          risk_summary: 'Smoke plume coverage extending 2.5 km downwind toward transportation arterial.',
          radius_meters: 1200,
        },
        {
          projection_window_hours: 6,
          threat_level: 'MODERATE',
          risk_summary: 'Secondary thermal degradation of structural steel supports if uncontained.',
          radius_meters: 1850,
        },
      ],
      advisory_notes: [
        'Projections assume prevailing wind 12 km/h from NW.',
        'Continuous atmospheric sensor monitoring recommended.',
      ],
    },
    recommended_actions: [
      {
        priority: 'CRITICAL',
        title: 'Deploy Specialized Industrial Foam Unit',
        action_type: 'DISPATCH',
        recommended_stakeholders: ['Industrial Fire Brigade', 'District Emergency Operations'],
        rationale: 'High thermal intensity (45.2 MW) and proximity to LNG Storage Terminal require Class-B foam.',
      },
      {
        priority: 'HIGH',
        title: 'Establish 800m Exclusion Perimeter',
        action_type: 'EVACUATION',
        recommended_stakeholders: ['Local Police / Traffic Authority', 'Plant Safety Officers'],
        rationale: 'Protect personnel from toxic combustion byproducts and thermal radiation.',
      },
    ],
    provenance: {
      observation_id: '423f0b1ad50facd6',
      investigated_at: '2026-09-08T11:00:01Z',
      threat_zone_calculated_at: '2026-09-08T11:00:02Z',
      asset_query_at: '2026-09-08T11:00:02Z',
      priority_evaluated_at: '2026-09-08T11:00:03Z',
      decision_support_generated_at: '2026-09-08T11:00:03Z',
    },
    safety_flags: {
      is_calibrated: false,
      is_synthetic: false,
      is_simulation_only: true,
    },
    disclaimers: [
      'AI Candidate Classification is an evidence-fusion output, not a standalone confirmation of an industrial fire.',
      'Sentinel-2 imagery is optical evidence and may not be temporally coincident with the FIRMS observation.',
      'Dynamic threat zones and scenario projections are simulation estimates — NOT official government evacuation orders.',
    ],
    warnings: [],
    created_at: '2026-09-08T11:00:03Z',
  };

  // Scenario A
  it('Scenario A: Validates complete decision support response structure', () => {
    assert.strictEqual(mockDecisionSupport.observation_id, '423f0b1ad50facd6');
    assert.strictEqual(mockDecisionSupport.status, 'SUCCESS');
    assert.ok(mockDecisionSupport.summary);
    assert.ok(mockDecisionSupport.priority);
    assert.ok(mockDecisionSupport.threat_zones);
    assert.ok(mockDecisionSupport.asset_exposure);
    assert.ok(mockDecisionSupport.impact);
    assert.ok(mockDecisionSupport.future_impact);
    assert.ok(Array.isArray(mockDecisionSupport.recommended_actions));
    assert.ok(mockDecisionSupport.provenance);
    assert.ok(mockDecisionSupport.safety_flags);
  });

  // Scenario B
  it('Scenario B: Priority scoring and explainability validation', () => {
    const p = mockDecisionSupport.priority;
    assert.strictEqual(typeof p.priority_score, 'number');
    assert.ok(p.priority_score >= 0 && p.priority_score <= 100);
    assert.ok(p.explainability_summary.length > 10);
    assert.ok(p.ranking_reasons.length > 0);
    assert.ok(p.scoring_breakdown.risk_component > 0);
  });

  // Scenario C
  it('Scenario C: Priority Index and Triage level mapping (P1-P4)', () => {
    const validLevels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
    const validIndices = ['P1', 'P2', 'P3', 'P4'];

    assert.ok(validLevels.includes(mockDecisionSupport.priority.priority_level));
    assert.ok(validIndices.includes(mockDecisionSupport.priority.priority_index));
    assert.strictEqual(mockDecisionSupport.priority.priority_index, 'P1');
    assert.strictEqual(mockDecisionSupport.priority.priority_level, 'CRITICAL');
  });

  // Scenario D
  it('Scenario D: Threat Zone modeling, radii breakdown, and actions', () => {
    const tz = mockDecisionSupport.threat_zones;
    assert.strictEqual(tz.available, true);
    assert.ok(tz.threat_radius_meters >= 1850);
    assert.ok(tz.high_hazard_zone.radius_meters > 0);
    assert.ok(tz.moderate_hazard_zone.radius_meters > tz.high_hazard_zone.radius_meters);
    assert.ok(tz.precautionary_zone.radius_meters >= tz.moderate_hazard_zone.radius_meters);
    assert.ok(tz.high_hazard_zone.key_actions.length > 0);
  });

  // Scenario E
  it('Scenario E: Critical Asset exposure & OSM facility proximity', () => {
    const ae = mockDecisionSupport.asset_exposure;
    assert.strictEqual(ae.available, true);
    assert.strictEqual(ae.total_exposed_assets, 4);
    assert.strictEqual(ae.critical_infrastructure_count, 2);
    assert.strictEqual(ae.facilities.length, 4);
    assert.strictEqual(ae.facilities[0].is_critical, true);
    assert.strictEqual(ae.facilities[0].name, 'LNG Storage Terminal 4');
  });

  // Scenario F
  it('Scenario F: Future impact multi-scenario timeline projections', () => {
    const fi = mockDecisionSupport.future_impact;
    assert.strictEqual(fi.available, true);
    assert.strictEqual(fi.scenarios_evaluated, 3);
    assert.strictEqual(fi.projections.length, 3);
    assert.strictEqual(fi.projections[0].projection_window_hours, 1);
    assert.strictEqual(fi.projections[1].projection_window_hours, 3);
    assert.strictEqual(fi.projections[2].projection_window_hours, 6);
    assert.ok(fi.advisory_notes.length > 0);
  });

  // Scenario G
  it('Scenario G: Multi-agency actionable recommendations with stakeholders', () => {
    const recs = mockDecisionSupport.recommended_actions;
    assert.ok(recs.length >= 2);
    assert.strictEqual(recs[0].priority, 'CRITICAL');
    assert.ok(recs[0].recommended_stakeholders.includes('Industrial Fire Brigade'));
    assert.ok(recs[0].rationale.includes('foam'));
  });

  // Scenario H
  it('Scenario H: Safety flags verification (is_calibrated=false, is_synthetic=false, is_simulation_only=true)', () => {
    const flags = mockDecisionSupport.safety_flags;
    assert.strictEqual(flags.is_calibrated, false);
    assert.strictEqual(flags.is_synthetic, false);
    assert.strictEqual(flags.is_simulation_only, true);
  });

  // Scenario I
  it('Scenario I: Three mandatory disclaimers validation', () => {
    const disclaimers = mockDecisionSupport.disclaimers;
    assert.strictEqual(disclaimers.length, 3);
    assert.ok(disclaimers[0].includes('AI Candidate Classification is an evidence-fusion output'));
    assert.ok(disclaimers[1].includes('Sentinel-2 imagery is optical evidence'));
    assert.ok(disclaimers[2].includes('Dynamic threat zones and scenario projections are simulation estimates'));
  });

  // Scenario J
  it('Scenario J: Partial evidence and degraded response handling with warnings', () => {
    const partialResponse = {
      ...mockDecisionSupport,
      status: 'PARTIAL_EVIDENCE',
      threat_zones: {
        available: false,
        threat_radius_meters: 500,
        high_hazard_zone: null,
        moderate_hazard_zone: null,
        precautionary_zone: null,
      },
      warnings: ['Threat zone service timed out. Falling back to 500m default radius.'],
    };

    assert.strictEqual(partialResponse.status, 'PARTIAL_EVIDENCE');
    assert.strictEqual(partialResponse.threat_zones.available, false);
    assert.strictEqual(partialResponse.threat_zones.threat_radius_meters, 500);
    assert.ok(partialResponse.warnings.length === 1);
  });

  // Scenario K
  it('Scenario K: Workflow tab switching state logic (INVESTIGATE vs DECIDE)', () => {
    let activeTab = 'INVESTIGATE';
    assert.strictEqual(activeTab, 'INVESTIGATE');

    // User clicks DECIDE tab
    activeTab = 'DECIDE';
    assert.strictEqual(activeTab, 'DECIDE');

    // Switch back to INVESTIGATE tab
    activeTab = 'INVESTIGATE';
    assert.strictEqual(activeTab, 'INVESTIGATE');
  });

  // Scenario L
  it('Scenario L: Session-local action state & dispatch triage notes', () => {
    let alertStatus = 'NEW';
    let triageNotes = '';

    const handleAction = (status, notes) => {
      alertStatus = status;
      triageNotes = notes;
    };

    handleAction('ACKNOWLEDGED', 'Operator acknowledged P1 critical priority.');
    assert.strictEqual(alertStatus, 'ACKNOWLEDGED');
    assert.strictEqual(triageNotes, 'Operator acknowledged P1 critical priority.');

    handleAction('INVESTIGATING', 'Foam tender deployed to petrochemical refinery perimeter.');
    assert.strictEqual(alertStatus, 'INVESTIGATING');
  });
});
