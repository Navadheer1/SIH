import React, { useState } from 'react';

export const ResponseOperationsView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'industrial' | 'hazmat' | 'evacuation'>('industrial');

  return (
    <div className="response-operations-view">
      <div className="view-header-bar">
        <div>
          <h2 className="view-title">🚒 Authority Response Operations & Tactical SOPs</h2>
          <p className="view-subtitle">
            Inter-Agency Coordination Guidelines • Standard Operating Procedures • Emergency Resource Triage
          </p>
        </div>
        <div className="status-badge-live">
          <span className="dot" /> SEOC PROTOCOL DEPLOYED
        </div>
      </div>

      <div className="sop-tabs-bar">
        <button
          type="button"
          className={`sop-tab-btn ${activeTab === 'industrial' ? 'active' : ''}`}
          onClick={() => setActiveTab('industrial')}
        >
          🏭 Industrial Fire Tactical SOP
        </button>
        <button
          type="button"
          className={`sop-tab-btn ${activeTab === 'hazmat' ? 'active' : ''}`}
          onClick={() => setActiveTab('hazmat')}
        >
          ☣️ Chemical & Hazmat Containment
        </button>
        <button
          type="button"
          className={`sop-tab-btn ${activeTab === 'evacuation' ? 'active' : ''}`}
          onClick={() => setActiveTab('evacuation')}
        >
          🛡️ Public Perimeter & Evacuation
        </button>
      </div>

      <div className="sop-content-card">
        {activeTab === 'industrial' && (
          <div className="sop-tab-body">
            <h3>Standard Operating Procedure: Heavy Industrial Fire Suppression</h3>
            <div className="sop-steps-grid">
              <div className="sop-step-box">
                <span className="step-num">PHASE 1</span>
                <h4>Initial Assessment & Isolation</h4>
                <ul>
                  <li>Establish outer security perimeter at 1,000 meters from thermal epicenter.</li>
                  <li>Verify facility chemical inventory and hazardous material data sheets (MSDS).</li>
                  <li>Shut down main supply pipelines, gas manifolds, and high-voltage grid feeders.</li>
                </ul>
              </div>
              <div className="sop-step-box">
                <span className="step-num">PHASE 2</span>
                <h4>Targeted Suppression Strategy</h4>
                <ul>
                  <li>Deploy Aqueous Film Forming Foam (AFFF) for hydrocarbon and fuel storage tanks.</li>
                  <li>Maintain continuous water curtain cooling on adjacent pressure vessels to prevent BLEVE.</li>
                  <li>Ensure uninterrupted water relay from nearest municipal or industrial water reservoir.</li>
                </ul>
              </div>
              <div className="sop-step-box">
                <span className="step-num">PHASE 3</span>
                <h4>Overhaul & Flare Verification</h4>
                <ul>
                  <li>Perform infrared thermal imaging to identify hidden hot spots in insulation layers.</li>
                  <li>Distinguish active structural fires from scheduled flare stack depressurization burns.</li>
                  <li>Maintain fire watch for minimum 12 hours following open flame extinguishment.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'hazmat' && (
          <div className="sop-tab-body">
            <h3>Standard Operating Procedure: Toxic Plume & Chemical Containment</h3>
            <div className="sop-steps-grid">
              <div className="sop-step-box">
                <span className="step-num">STEP 1</span>
                <h4>Plume Modeling & Dispersion</h4>
                <ul>
                  <li>Deploy portable gas detectors (VOC, SO2, NOx, CO, Chlorine) downwind.</li>
                  <li>Calculate downwind plume dispersion based on real-time wind vector and humidity.</li>
                  <li>Issue immediate N95/protective advisory for downwind settlements.</li>
                </ul>
              </div>
              <div className="sop-step-box">
                <span className="step-num">STEP 2</span>
                <h4>Hazmat Unit Dispatch</h4>
                <ul>
                  <li>Deploy Level-A encapsulated Hazmat teams for chemical containment leaks.</li>
                  <li>Prepare neutralization agents (lime slurry, activated carbon booms).</li>
                  <li>Contain contaminated runoff water to prevent infiltration into local drainage basins.</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'evacuation' && (
          <div className="sop-tab-body">
            <h3>Standard Operating Procedure: Perimeter Control & Evacuation Protocol</h3>
            <div className="sop-steps-grid">
              <div className="sop-step-box">
                <span className="step-num">PRIORITY 1</span>
                <h4>Traffic Corridor Management</h4>
                <ul>
                  <li>Designate Highway lanes as dedicated Emergency Response Corridors (ERC).</li>
                  <li>Divert commercial freight traffic away from the 5.0 km emergency perimeter.</li>
                  <li>Station police control units at all arterial access roads.</li>
                </ul>
              </div>
              <div className="sop-step-box">
                <span className="step-num">PRIORITY 2</span>
                <h4>Staging & Temporary Shelter</h4>
                <ul>
                  <li>Activate pre-designated district cyclone/emergency shelters outside the 5.0 km zone.</li>
                  <li>Stage emergency medical ambulances at the secondary perimeter (2.0 km).</li>
                  <li>Coordinate with public broadcasting for clear, non-panicking emergency updates.</li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
