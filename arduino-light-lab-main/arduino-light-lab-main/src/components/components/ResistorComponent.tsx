import { useState } from "react";

interface ResistorComponentProps {
  x: number;
  y: number;
  isSimulating?: boolean;
}

export const ResistorComponent = ({ x, y, isSimulating }: ResistorComponentProps) => {
  const [position, setPosition] = useState({ x, y });

  return (
    <div
      className="absolute cursor-move select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      <svg width="100" height="40" viewBox="0 0 100 40" className="drop-shadow-lg">
        {/* Resistor body */}
        <rect x="20" y="12" width="60" height="16" rx="2" fill="#E8D4A8" stroke="#8B7355" strokeWidth="1" />
        
        {/* Color bands for 220Ω resistor (Red-Red-Brown-Gold) */}
        <rect x="28" y="10" width="5" height="20" fill="#FF0000" />
        <rect x="43" y="10" width="5" height="20" fill="#FF0000" />
        <rect x="58" y="10" width="5" height="20" fill="#8B4513" />
        <rect x="70" y="10" width="4" height="20" fill="#FFD700" />
        
        {/* Wires */}
        <line x1="0" y1="20" x2="20" y2="20" stroke={isSimulating ? "#10B981" : "#C0C0C0"} strokeWidth={isSimulating ? "3" : "2"} />
        <line x1="80" y1="20" x2="100" y2="20" stroke={isSimulating ? "#10B981" : "#C0C0C0"} strokeWidth={isSimulating ? "3" : "2"} />
        
        {/* Wire end caps */}
        <circle cx="20" cy="20" r="1.5" fill={isSimulating ? "#10B981" : "#C0C0C0"} />
        <circle cx="80" cy="20" r="1.5" fill={isSimulating ? "#10B981" : "#C0C0C0"} />
        
        {isSimulating && (
          <>
            {/* Glow effect */}
            <circle cx="50" cy="20" r="35" fill="rgba(16, 185, 129, 0.1)" />
          </>
        )}
      </svg>
    </div>
  );
};
