// Component type definitions
export interface ComponentPin {
  id: string;
  label: string;
  x: number;
  y: number;
  type: "digital" | "analog" | "power" | "ground" | "data";
  direction?: "left" | "right" | "top" | "bottom"; // Pin direction for wire routing
}

export interface ComponentConfig {
  id: string;
  name: string;
  category:
  | "sensors"
  | "displays"
  | "actuators"
  | "communication"
  | "basic"
  | "boards";
  description: string;
  pins: ComponentPin[];
  width: number;
  height: number;
  imagePath?: string;
  defaultProps?: Record<string, unknown>;
}

export interface PlacedComponent extends ComponentConfig {
  instanceId: string;
  x: number;
  y: number;
  rotation?: number;
  props?: Record<string, unknown>;
}

// Component categories
export const COMPONENT_CATEGORIES = {
  SENSORS: "sensors",
  DISPLAYS: "displays",
  ACTUATORS: "actuators",
  COMMUNICATION: "communication",
  BASIC: "basic",
  BOARDS: "boards",
} as const;
