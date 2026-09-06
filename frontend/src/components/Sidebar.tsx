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
  const navItems: { id: SidebarNavView; label: string; icon: string; badge?: number; badgeType?: 'critical' | 'normal' }[] = [
    { id: 'command_center', label: 'Command Center', icon: '🏛️' },
    { id: 'live_incidents', label: 'Live Incidents', icon: '🔥', badge: activeIncidentsCount, badgeType: 'critical' },
    { id: 'hotspot_intelligence', label: 'Hotspot Intelligence', icon: '🛰️', badge: hotspotsCount },
    { id: 'impact_analysis', label: 'Impact Analysis', icon: '🏭' },
    { id: 'alerts', label: 'Alerts', icon: '🚨', badge: criticalAlertsCount, badgeType: 'critical' },
    { id: 'response_operations', label: 'Response Operations', icon: '🚒' },
    { id: 'incident_history', label: 'Incident History', icon: '📜', badge: resolvedIncidentsCount },
    { id: 'analytics', label: 'Analytics', icon: '📊' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
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
              <span className="nav-icon">{item.icon}</span>
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
