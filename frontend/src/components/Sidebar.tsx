import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLandmark, faFire, faSatellite, faIndustry, faTriangleExclamation, faTruckMedical, faFileLines, faChartSimple, faGear } from '@fortawesome/free-solid-svg-icons';
import React from 'react';

export type SidebarNavView =
  | 'command_center'
  | 'live_incidents'
  | 'hotspot_intelligence'
  | 'impact_analysis'
  | 'alerts'
  | 'response_operations'
  | 'incident_history'
  | 'analytics'
  | 'settings';

interface SidebarProps {
  activeView: SidebarNavView;
  onViewChange: (view: SidebarNavView) => void;
  activeIncidentsCount: number;
  hotspotsCount: number;
  criticalAlertsCount: number;
  resolvedIncidentsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
  activeIncidentsCount,
  hotspotsCount,
  criticalAlertsCount,
  resolvedIncidentsCount,
}) => {
  const navItems: { id: SidebarNavView; label: string; icon: IconDefinition; badge?: number; badgeType?: 'critical' | 'normal' }[] = [
    { id: 'command_center', label: 'Command Center', icon: faLandmark },
    { id: 'live_incidents', label: 'Live Incidents', icon: faFire, badge: activeIncidentsCount, badgeType: 'critical' },
    { id: 'hotspot_intelligence', label: 'Hotspot Intelligence', icon: faSatellite, badge: hotspotsCount },
    { id: 'impact_analysis', label: 'Impact Analysis', icon: faIndustry },
    { id: 'alerts', label: 'Alerts', icon: faTriangleExclamation, badge: criticalAlertsCount, badgeType: 'critical' },
    { id: 'response_operations', label: 'Response Operations', icon: faTruckMedical },
    { id: 'incident_history', label: 'Incident History', icon: faFileLines, badge: resolvedIncidentsCount },
    { id: 'analytics', label: 'Analytics', icon: faChartSimple },
    { id: 'settings', label: 'Settings', icon: faGear },
  ];

  return (
    <aside className="eoc-sidebar">
      <div className="sidebar-section-title">DISASTER OPERATIONS</div>
      <nav className="sidebar-nav-menu">
        {navItems.map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`sidebar-nav-item ${isActive ? 'active' : ''}`}
              onClick={() => onViewChange(item.id)}
            >
              <FontAwesomeIcon icon={item.icon} className="nav-icon" />
              <span className="nav-label">{item.label}</span>
              {item.badge !== undefined && item.badge > 0 && (
                <span className={`nav-badge ${item.badgeType === 'critical' ? 'badge-critical' : 'badge-subtle'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sidebar-footer-card">
        <div className="eoc-status-pill">
          <span className="dot-pulse" />
          <span className="status-caption">NATIONAL GRID SYNC</span>
        </div>
        <div className="eoc-coord-center">EOC HQ: VIJAYAWADA SEOC</div>
      </div>
    </aside>
  );
};
