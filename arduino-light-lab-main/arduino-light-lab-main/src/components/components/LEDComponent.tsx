import { useState } from "react";

interface LEDComponentProps {
  x: number;
  y: number;
  isOn?: boolean;
}

export const LEDComponent = ({ x, y, isOn }: LEDComponentProps) => {
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x, y });

  return (
    <div
      className="absolute cursor-move select-none"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transition: isDragging ? 'none' : 'all 0.2s ease',
      }}
      onMouseDown={() => setIsDragging(true)}
      onMouseUp={() => setIsDragging(false)}
    >
      <svg width="30" height="80" viewBox="0 0 30 80" className="drop-shadow-lg">
        {/* LED Body */}
        <defs>
          <radialGradient id="ledGlow" cx="50%" cy="30%">
            <stop offset="0%" stopColor={isOn ? "#ff6b6b" : "#dc2626"} stopOpacity={isOn ? "1" : "0.8"} />
            <stop offset="100%" stopColor={isOn ? "#dc2626" : "#991b1b"} stopOpacity="0.9" />
          </radialGradient>
          {isOn && (
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge>
                <feMergeNode in="coloredBlur"/>
                <feMergeNode in="SourceGraphic"/>
              </feMerge>
            </filter>
          )}
        </defs>
        
        {/* Glow effect when on */}
        {isOn && (
          <circle cx="15" cy="15" r="12" fill="#ff6b6b" opacity="0.4" filter="url(#glow)" />
        )}
        
        {/* LED dome */}
        <ellipse cx="15" cy="18" rx="10" ry="4" fill="#dc2626" opacity="0.3" />
        <circle cx="15" cy="15" r="10" fill="url(#ledGlow)" />
        
        {/* LED highlight */}
        <ellipse cx="12" cy="12" rx="4" ry="5" fill="white" opacity={isOn ? "0.6" : "0.3"} />
        
        {/* LED Anode (longer leg) */}
        <line x1="15" y1="25" x2="15" y2="55" stroke="#C0C0C0" strokeWidth="2" />
        <line x1="15" y1="55" x2="10" y2="60" stroke="#C0C0C0" strokeWidth="2" />
        
        {/* LED Cathode (shorter leg) */}
        <line x1="15" y1="25" x2="15" y2="45" stroke="#C0C0C0" strokeWidth="2" />
        <line x1="15" y1="45" x2="20" y2="50" stroke="#C0C0C0" strokeWidth="2" />
        
        {/* Cathode indicator (flat side) */}
        <path d="M 10 20 L 10 26" stroke="#991b1b" strokeWidth="1.5" />
      </svg>
    </div>
  );
};
