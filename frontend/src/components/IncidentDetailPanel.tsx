import {
  Hotspot,
  PersistentCluster,
  ThermalAlert,
} from '../types/hotspot';
import { InvestigationPanel } from './InvestigationPanel';

export interface IncidentDetailPanelProps {
  hotspot?: Hotspot | null;
  cluster?: PersistentCluster | null;
  alert?: ThermalAlert | null;
  onClose: () => void;
  onStatusChange?: (alertId: string, newStatus: ThermalAlert['status'], notes?: string) => void;
}

/**
 * IncidentDetailPanel serves as the operational drawer modal integrating the
 * canonical Phase 6F/6G Investigation & Multi-Source Evidence Fusion UI.
 */
export function IncidentDetailPanel({
  hotspot,
  cluster,
  alert,
  onClose,
  onStatusChange,
}: IncidentDetailPanelProps) {
  const observationId =
    hotspot?.observation_id ||
    (alert?.cluster_id && alert.cluster_id.startsWith('FIRMS_')
      ? alert.cluster_id.replace('FIRMS_', '')
      : undefined) ||
    (cluster?.observations && cluster.observations.length > 0
      ? cluster.observations[0].observation_id
      : undefined);

  return (
    <InvestigationPanel
      observationId={observationId}
      hotspot={hotspot}
      cluster={cluster}
      alert={alert}
      onClose={onClose}
      onStatusChange={onStatusChange}
    />
  );
}
