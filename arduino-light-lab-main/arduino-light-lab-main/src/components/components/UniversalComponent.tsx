import { useState } from "react";
import { PlacedComponent } from "@/types/components";

interface UniversalComponentProps {
  component: PlacedComponent;
  isSimulating?: boolean;
  isDraggable?: boolean;
  onDragStart?: (e: React.DragEvent, instanceId: string) => void;
  onDragEnd?: (e: React.DragEvent) => void;
  pinState?: boolean; // For LED glow effect
}

export const UniversalComponent = ({
  component,
  isSimulating = false,
  isDraggable = true,
  onDragStart,
  onDragEnd,
  pinState,
}: UniversalComponentProps) => {
  // Enhanced debug logging
  if (component.id.includes("led")) {
    console.log(`🔍 UniversalComponent LED: ${component.name}`, {
      isSimulating,
      pinState,
      componentId: component.id,
      shouldGlow: isSimulating && pinState,
    });
  }
  const [isDragging, setIsDragging] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(true);
    if (onDragStart) {
      onDragStart(e, component.instanceId);
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation();
    setIsDragging(false);
    if (onDragEnd) {
      onDragEnd(e);
    }
  };

  // Render component with image or placeholder
  return (
    <div
      className={`absolute select-none transition-all ${isDraggable ? "cursor-move" : "cursor-default"
        } ${isDragging ? "opacity-50" : "opacity-100"}`}
      style={{
        left: `${component.x}px`,
        top: `${component.y}px`,
        width: `${component.width}px`,
        height: `${component.height}px`,
        transform: component.rotation
          ? `rotate(${component.rotation}deg)`
          : undefined,
        zIndex: isDragging ? 1000 : 1,
      }}
      draggable={isDraggable}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      {/* Component Image or Placeholder */}
      <div className="relative w-full h-full">
        {component.imagePath ? (
          <>
            <img
              src={component.imagePath}
              alt={component.name}
              className="w-full h-full object-contain"
              onError={(e) => {
                // Fallback to placeholder if image fails to load
                e.currentTarget.style.display = "none";
                e.currentTarget.nextElementSibling?.classList.remove("hidden");
              }}
            />
            {/* SIMPLIFIED LED GLOW SYSTEM - Always show glow when simulating and LED component */}
            {component.id.includes("led") && isSimulating && (
              <div
                className="absolute inset-0 pointer-events-none z-10"
                style={{
                  backgroundColor: pinState
                    ? "rgba(255, 0, 0, 0.9)"
                    : "rgba(100, 100, 100, 0.3)",
                  boxShadow: pinState
                    ? "0 0 30px rgba(255, 0, 0, 1), 0 0 60px rgba(255, 0, 0, 0.8)"
                    : "none",
                  animation: pinState
                    ? "pulse 1s ease-in-out infinite alternate"
                    : "none",
                  opacity: pinState ? 1 : 0.3,
                  borderRadius: "50%",
                }}
              />
            )}

            {/* EMERGENCY LED GLOW - Always visible during simulation for testing */}
            {component.id.includes("led") && isSimulating && (
              <div
                className="absolute inset-1 pointer-events-none z-20 border-4 rounded-full"
                style={{
                  borderColor: pinState ? "#ff0000" : "#666666",
                  backgroundColor: pinState
                    ? "rgba(255, 0, 0, 0.7)"
                    : "transparent",
                  animation: pinState
                    ? "pulse 0.8s ease-in-out infinite"
                    : "none",
                }}
              />
            )}

            {/* Enhanced Status indicator during simulation */}
            {isSimulating && (
              <div className="absolute top-1 right-1 flex items-center gap-1">
                <div
                  className={`w-4 h-4 rounded-full border-2 border-white shadow-md ${pinState ? "bg-green-500 animate-pulse" : "bg-red-500"
                    }`}
                />
                <div className="text-xs font-bold text-white bg-black px-1 rounded">
                  {pinState ? "ON" : "OFF"}
                </div>
              </div>
            )}

            {/* Arduino boards show no visual effects during simulation */}

            {/* Motor effects - Spinning animation */}
            {(component.id.includes("motor") ||
              component.id.includes("servo")) &&
              isSimulating &&
              pinState && (
                <div
                  className="absolute inset-0 border-2 border-blue-400 rounded bg-blue-400/20 pointer-events-none"
                  style={{
                    boxShadow: "0 0 15px rgba(59, 130, 246, 0.8)",
                    animation:
                      "spin 2s linear infinite, pulse 1s ease-in-out infinite alternate",
                  }}
                />
              )}

            {/* Buzzer effects - Sound waves animation */}
            {component.id.includes("buzzer") && isSimulating && pinState && (
              <>
                <div
                  className="absolute inset-0 rounded-full border-2 border-yellow-400 bg-yellow-400/20 pointer-events-none animate-ping"
                  style={{
                    boxShadow: "0 0 20px rgba(255, 193, 7, 0.8)",
                  }}
                />
                <div
                  className="absolute inset-0 rounded-full border border-yellow-300 pointer-events-none"
                  style={{
                    animation: "ping 0.5s ease-in-out infinite",
                    animationDelay: "0.2s",
                  }}
                />
              </>
            )}

            {/* Sensor effects - Data activity */}
            {(component.id.includes("dht") ||
              component.id.includes("ultrasonic") ||
              component.id.includes("pir") ||
              component.id.includes("sensor") ||
              component.id.includes("mq") ||
              component.id.includes("hc-sr04")) &&
              isSimulating &&
              pinState && (
                <div
                  className="absolute inset-0 border-2 border-green-400 rounded bg-green-400/20 pointer-events-none"
                  style={{
                    boxShadow: "0 0 10px rgba(34, 197, 94, 0.6)",
                    animation: "pulse 2s ease-in-out infinite",
                  }}
                />
              )}

            {/* Display effects - Screen glow */}
            {(component.id.includes("lcd") ||
              component.id.includes("oled") ||
              component.id.includes("display") ||
              component.id.includes("segment") ||
              component.id.includes("matrix")) &&
              isSimulating &&
              pinState && (
                <div
                  className="absolute inset-0 border-2 border-cyan-400 rounded bg-cyan-400/20 pointer-events-none"
                  style={{
                    boxShadow: "0 0 15px rgba(6, 182, 212, 0.7)",
                    animation: "pulse 3s ease-in-out infinite",
                  }}
                />
              )}

            {/* Communication module effects */}
            {(component.id.includes("bluetooth") ||
              component.id.includes("hc05") ||
              component.id.includes("esp") ||
              component.id.includes("wifi") ||
              component.id.includes("nrf") ||
              component.id.includes("rfid")) &&
              isSimulating &&
              pinState && (
                <div
                  className="absolute inset-0 border-2 border-purple-400 rounded bg-purple-400/20 pointer-events-none"
                  style={{
                    boxShadow: "0 0 12px rgba(147, 51, 234, 0.6)",
                    animation: "pulse 1.5s ease-in-out infinite",
                  }}
                />
              )}

            {/* Resistor effects - Current flow */}
            {component.id.includes("resistor") && isSimulating && pinState && (
              <div
                className="absolute inset-0 border-2 border-orange-400 rounded bg-orange-400/20 pointer-events-none"
                style={{
                  boxShadow: "0 0 10px rgba(249, 115, 22, 0.5)",
                  animation: "pulse 2s ease-in-out infinite",
                }}
              />
            )}

            {/* Capacitor effects */}
            {component.id.includes("capacitor") && isSimulating && pinState && (
              <div
                className="absolute inset-0 border-2 border-indigo-400 rounded bg-indigo-400/20 pointer-events-none"
                style={{
                  boxShadow: "0 0 8px rgba(99, 102, 241, 0.5)",
                  animation: "pulse 1.8s ease-in-out infinite",
                }}
              />
            )}

            {/* Button effects - Press indication */}
            {component.id.includes("button") && isSimulating && pinState && (
              <div
                className="absolute inset-0 border-2 border-red-400 rounded bg-red-400/30 pointer-events-none"
                style={{
                  boxShadow: "0 0 10px rgba(239, 68, 68, 0.7)",
                  animation: "pulse 0.5s ease-in-out infinite",
                }}
              />
            )}

            {/* Arduino board effects */}
            {component.id.includes("arduino") && isSimulating && (
              <div
                className="absolute inset-0 border-2 border-emerald-400 rounded bg-emerald-400/10 pointer-events-none"
                style={{
                  boxShadow: "0 0 15px rgba(16, 185, 129, 0.4)",
                  animation: "pulse 4s ease-in-out infinite",
                }}
              />
            )}
          </>
        ) : null}

        {/* Placeholder when image is not available */}
        <div
          className={`${component.imagePath ? "hidden" : ""
            } w-full h-full bg-gradient-to-br from-primary/20 to-primary/5 border-2 border-primary/30 rounded-lg flex flex-col items-center justify-center p-2`}
        >
          <div className="text-xs font-semibold text-center text-primary truncate w-full">
            {component.name}
          </div>
          <div className="text-[10px] text-center text-muted-foreground mt-1 truncate w-full">
            {component.category}
          </div>
          {isSimulating && (
            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          )}
        </div>

      </div>

      {/* Component label */}
      <div className="absolute -bottom-5 left-0 right-0 text-[10px] text-center text-muted-foreground truncate">
        {component.name}
      </div>
    </div>
  );
};
