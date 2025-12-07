import { useState } from "react";
import arduinoImage from "@/assets/arduino-uno.png";

interface ArduinoComponentProps {
  x: number;
  y: number;
  isSimulating?: boolean;
}

export const ArduinoComponent = ({ x, y, isSimulating }: ArduinoComponentProps) => {
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
      <img 
        src={arduinoImage} 
        alt="Arduino UNO"
        className="drop-shadow-lg w-[400px] h-auto"
        draggable={false}
      />
      {isSimulating && (
        <div className="absolute top-4 left-8 w-3 h-3 rounded-full bg-green-500 animate-pulse" />
      )}
    </div>
  );
};
