/**
 * Centralized Frontend API Client & Endpoint Configuration
 *
 * Reads backend API base URL from Vite environment variable `VITE_API_BASE_URL`.
 * Defaults to 'http://localhost:8000' for local development.
 */

export const API_BASE_URL: string = (
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
).replace(/\/+$/, '');

/**
 * Builds a normalized, fully-qualified backend API endpoint URL.
 *
 * @param path Endpoint path (e.g., '/api/hotspots', 'api/alerts')
 * @returns Complete URL string with API_BASE_URL prefix
 */
export function getApiUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
}

/**
 * Resolves static or media asset URLs (such as satellite image patches)
 * served by the backend or external CDNs.
 *
 * @param path Relative or absolute asset path
 * @returns Fully qualified asset URL or null if empty
 */
export function getAssetUrl(path?: string | null): string | null {
  if (!path) return null;
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }
  return getApiUrl(path);
}

/**
 * Fetches the newest real NASA FIRMS observation with data freshness categorization.
 */
export async function fetchLatestFirmsObservation(): Promise<import('../types/hotspot').LatestFirmsResponse> {
  const response = await fetch(getApiUrl('/api/firms/latest'));
  if (!response.ok) {
    throw new Error(`Failed to fetch latest FIRMS observation: HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * In-flight promise registry for getInvestigation to prevent redundant concurrent fetches.
 */
const inFlightInvestigations = new Map<string, Promise<import('../types/hotspot').InvestigationResponse>>();

/**
 * Retrieves the comprehensive Phase 6F multi-source investigation for a given FIRMS observation ID.
 *
 * @param observationId The unique FIRMS observation ID
 * @param forceRefresh Whether to bypass backend and client caching
 * @param signal Optional AbortSignal to cancel in-flight HTTP request
 * @returns Fully validated InvestigationResponse
 */
export async function getInvestigation(
  observationId: string,
  forceRefresh: boolean = false,
  signal?: AbortSignal
): Promise<import('../types/hotspot').InvestigationResponse> {
  if (!observationId || typeof observationId !== 'string') {
    throw new Error('Observation ID is required to fetch investigation.');
  }

  const cleanId = observationId.trim();

  // If not forcing refresh and an identical request is in flight, reuse the promise
  if (!forceRefresh && inFlightInvestigations.has(cleanId)) {
    return inFlightInvestigations.get(cleanId)!;
  }

  const queryParam = forceRefresh ? '?force_refresh=true' : '';
  const url = getApiUrl(`/api/firms/${encodeURIComponent(cleanId)}/investigation${queryParam}`);

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.detail) {
            errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // fallback to status text
        }
        throw new Error(`Investigation fetch failed (${errorDetail})`);
      }

      const data: import('../types/hotspot').InvestigationResponse = await response.json();
      return data;
    } finally {
      // Clean up in-flight registry
      inFlightInvestigations.delete(cleanId);
    }
  })();

  if (!forceRefresh) {
    inFlightInvestigations.set(cleanId, fetchPromise);
  }

  return fetchPromise;
}

/**
 * In-flight promise registry for getDecisionSupport to prevent redundant concurrent fetches.
 */
const inFlightDecisionSupport = new Map<string, Promise<import('../types/hotspot').DecisionSupportResponse>>();

/**
 * Retrieves the comprehensive Phase 6H operational decision support for a given FIRMS observation ID.
 *
 * @param observationId The unique FIRMS observation ID
 * @param forceRefresh Whether to bypass backend and client caching
 * @param signal Optional AbortSignal to cancel in-flight HTTP request
 * @returns Fully validated DecisionSupportResponse
 */
export async function getDecisionSupport(
  observationId: string,
  forceRefresh: boolean = false,
  signal?: AbortSignal
): Promise<import('../types/hotspot').DecisionSupportResponse> {
  if (!observationId || typeof observationId !== 'string') {
    throw new Error('Observation ID is required to fetch decision support.');
  }

  const cleanId = observationId.trim();

  if (!forceRefresh && inFlightDecisionSupport.has(cleanId)) {
    return inFlightDecisionSupport.get(cleanId)!;
  }

  const queryParam = forceRefresh ? '?force_refresh=true' : '';
  const url = getApiUrl(`/api/firms/${encodeURIComponent(cleanId)}/decision-support${queryParam}`);

  const fetchPromise = (async () => {
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
        signal,
      });

      if (!response.ok) {
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errJson = await response.json();
          if (errJson.detail) {
            errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
          }
        } catch {
          // fallback to status text
        }
        throw new Error(`Decision support fetch failed (${errorDetail})`);
      }

      const data: import('../types/hotspot').DecisionSupportResponse = await response.json();
      return data;
    } finally {
      inFlightDecisionSupport.delete(cleanId);
    }
  })();

  if (!forceRefresh) {
    inFlightDecisionSupport.set(cleanId, fetchPromise);
  }

  return fetchPromise;
}

/**
 * Records an operator triage action on an incident (ACKNOWLEDGE, DISPATCH, INVESTIGATE, ESCALATE, RESOLVE, DISMISS, ADD_NOTE).
 */
export async function recordIncidentAction(
  observationId: string,
  request: import('../types/hotspot').IncidentActionRequest
): Promise<import('../types/hotspot').IncidentActionResponse> {
  if (!observationId || typeof observationId !== 'string') {
    throw new Error('Observation ID is required to record incident action.');
  }

  const cleanId = observationId.trim();
  const url = getApiUrl(`/api/incidents/${encodeURIComponent(cleanId)}/action`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // fallback
    }
    throw new Error(`Failed to record action: ${errorDetail}`);
  }

  return response.json();
}

/**
 * Retrieves the complete chronological audit trail and state history for an incident.
 */
export async function getIncidentAuditTrail(
  observationId: string,
  descending: boolean = true
): Promise<import('../types/hotspot').IncidentAuditTrailResponse> {
  if (!observationId || typeof observationId !== 'string') {
    throw new Error('Observation ID is required to fetch audit trail.');
  }

  const cleanId = observationId.trim();
  const url = getApiUrl(`/api/incidents/${encodeURIComponent(cleanId)}/audit-trail?descending=${descending}`);

  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson.detail) {
        errorDetail = typeof errJson.detail === 'string' ? errJson.detail : JSON.stringify(errJson.detail);
      }
    } catch {
      // fallback
    }
    throw new Error(`Failed to fetch audit trail: ${errorDetail}`);
  }

  return response.json();
}

/**
 * Retrieves fleet-wide operational triage summary counts.
 */
export async function getIncidentOperationalSummary(): Promise<import('../types/hotspot').IncidentOperationalSummary> {
  const url = getApiUrl('/api/incidents/operational-summary');
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch operational summary: HTTP ${response.status}`);
  }

  return response.json();
}

/**
 * Pre-configured verified benchmark scenarios for SIH judging and live demonstration.
 */
export const DEMO_SCENARIO_PRESETS: import('../types/hotspot').DemoScenarioPreset[] = [
  {
    id: 'demo_industrial_p1',
    name: 'Petrochemical Refinery Flare [P1 CRITICAL]',
    description: 'Persistent 45 MW thermal anomaly adjacent to LNG storage tanks. 6-band CNN confirmed industrial fire candidate.',
    observation_id: '423f0b1ad50facd6',
    priority: 'P1',
    priority_label: 'CRITICAL',
    candidate_class: 'INDUSTRIAL_FIRE',
    coordinates: [24.23818, 97.22869],
    location_name: 'Gujarat Petrochemical Corridor',
    badge: '🏭 P1 CRITICAL',
  },
  {
    id: 'demo_wildfire_p2',
    name: 'Forest Canopy Wildfire [P2 HIGH]',
    description: 'High-radiance biomass fire spreading along timber line. Optical CNN identifies wildfire signatures.',
    observation_id: '04e53a2f16d0d665',
    priority: 'P2',
    priority_label: 'HIGH',
    candidate_class: 'WILDFIRE',
    coordinates: [22.6789, 80.54321],
    location_name: 'Kanha Forest Reserve Perimeter',
    badge: '🌲 P2 HIGH',
  },
  {
    id: 'demo_crop_burn_p4',
    name: 'Agricultural Crop Residual [P4 LOW]',
    description: 'Transient thermal signature with zero nearby industrial facilities. Clear sky land validation.',
    observation_id: 'a35cd8640d876fc2',
    priority: 'P4',
    priority_label: 'LOW',
    candidate_class: 'NON_FIRE',
    coordinates: [30.7333, 76.7794],
    location_name: 'Northern Agricultural Belt',
    badge: '🌾 P4 LOW',
  },
  {
    id: 'demo_degraded_cloud',
    name: 'Coastal Anomaly (Cloud Degraded) [P3 MEDIUM]',
    description: 'Thermal anomaly with >70% cloud cover. System activates safety guardrail and flags partial evidence.',
    observation_id: '90b58068fefb3a79',
    priority: 'P3',
    priority_label: 'MEDIUM',
    candidate_class: 'UNKNOWN',
    coordinates: [21.8456, 73.1234],
    location_name: 'Gulf Coastal Industrial Zone',
    badge: '☁️ P3 GUARDRAIL',
  },
];


