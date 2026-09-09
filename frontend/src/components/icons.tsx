import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFire,
  faTriangleExclamation,
  faIndustry,
  faMap,
  faBolt,
  faChartSimple,
  faGear,
  faSatellite,
  faHospital,
  faTruckMedical,
  faBullseye,
  faMagnifyingGlass,
  faTemperatureHigh,
  faDatabase,
  faUser,
  faCheck,
  faXmark,
  faArrowsRotate,
  faSpinner,
  faTree,
  faWheatAwn,
  faCloud,
  faClock,
  faBookOpen,
  faLocationDot,
  faRuler,
  faScaleBalanced,
  faGraduationCap,
  faRoad,
  faTrain,
  faLandmark,
  faCity,
  faHouse,
  faFilter,
  faCircle,
  faCircleCheck,
  faCircleXmark,
  faCircleInfo,
  faShieldHalved,
  faEye,
  faDownload,
  faSliders,
  faList,
  faTable,
  faPlay,
  faCube,
  faLayerGroup,
  faCompass,
  faBell,
  faCircleExclamation,
  faAngleRight,
  faArrowRight,
  faArrowUp,
  faArrowDown,
  faFileLines,
  faSquareCheck,
  faShield,
  faMicrochip,
  faWaveSquare,
} from '@fortawesome/free-solid-svg-icons';

export {
  FontAwesomeIcon,
  faFire,
  faTriangleExclamation,
  faIndustry,
  faMap,
  faBolt,
  faChartSimple,
  faGear,
  faSatellite,
  faHospital,
  faTruckMedical,
  faBullseye,
  faMagnifyingGlass,
  faTemperatureHigh,
  faDatabase,
  faUser,
  faCheck,
  faXmark,
  faArrowsRotate,
  faSpinner,
  faTree,
  faWheatAwn,
  faCloud,
  faClock,
  faBookOpen,
  faLocationDot,
  faRuler,
  faScaleBalanced,
  faGraduationCap,
  faRoad,
  faTrain,
  faLandmark,
  faCity,
  faHouse,
  faFilter,
  faCircle,
  faCircleCheck,
  faCircleXmark,
  faCircleInfo,
  faShieldHalved,
  faEye,
  faDownload,
  faSliders,
  faList,
  faTable,
  faPlay,
  faCube,
  faLayerGroup,
  faCompass,
  faBell,
  faCircleExclamation,
  faAngleRight,
  faArrowRight,
  faArrowUp,
  faArrowDown,
  faFileLines,
  faSquareCheck,
  faShield,
  faMicrochip,
  faWaveSquare,
};

export interface AppIconProps {
  name:
    | 'fire'
    | 'alert'
    | 'warning'
    | 'industry'
    | 'map'
    | 'bolt'
    | 'chart'
    | 'gear'
    | 'satellite'
    | 'hospital'
    | 'medical'
    | 'bullseye'
    | 'search'
    | 'temperature'
    | 'database'
    | 'user'
    | 'check'
    | 'close'
    | 'sync'
    | 'spinner'
    | 'tree'
    | 'crop'
    | 'cloud'
    | 'clock'
    | 'book'
    | 'location'
    | 'ruler'
    | 'scale'
    | 'education'
    | 'road'
    | 'train'
    | 'landmark'
    | 'city'
    | 'filter'
    | 'circle'
    | 'shield'
    | 'eye'
    | 'cube'
    | 'layers';
  className?: string;
  spin?: boolean;
  style?: React.CSSProperties;
}

const iconMap = {
  fire: faFire,
  alert: faTriangleExclamation,
  warning: faTriangleExclamation,
  industry: faIndustry,
  map: faMap,
  bolt: faBolt,
  chart: faChartSimple,
  gear: faGear,
  satellite: faSatellite,
  hospital: faHospital,
  medical: faTruckMedical,
  bullseye: faBullseye,
  search: faMagnifyingGlass,
  temperature: faTemperatureHigh,
  database: faDatabase,
  user: faUser,
  check: faCheck,
  close: faXmark,
  sync: faArrowsRotate,
  spinner: faSpinner,
  tree: faTree,
  crop: faWheatAwn,
  cloud: faCloud,
  clock: faClock,
  book: faBookOpen,
  location: faLocationDot,
  ruler: faRuler,
  scale: faScaleBalanced,
  education: faGraduationCap,
  road: faRoad,
  train: faTrain,
  landmark: faLandmark,
  city: faCity,
  filter: faFilter,
  circle: faCircle,
  shield: faShieldHalved,
  eye: faEye,
  cube: faCube,
  layers: faLayerGroup,
};

export const AppIcon: React.FC<AppIconProps> = ({ name, className, spin, style }) => {
  const icon = iconMap[name] || faCircle;
  return <FontAwesomeIcon icon={icon} className={className} spin={spin} style={style as any} />;
};
