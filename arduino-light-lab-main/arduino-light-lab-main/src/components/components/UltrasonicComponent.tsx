import React, { useEffect, useState } from 'react';
import { PlacedComponent } from '@/types/components';

interface UltrasonicComponentProps {
    component: PlacedComponent;
    isSimulating: boolean;
    onDistanceUpdate?: (distance: number) => void;
}

export const UltrasonicComponent: React.FC<UltrasonicComponentProps> = ({
    component,
    isSimulating,
    onDistanceUpdate,
}) => {
    const [distance, setDistance] = useState(0);
    const [isPinging, setIsPinging] = useState(false);

    // Simulate ultrasonic sensor readings
    useEffect(() => {
        if (!isSimulating) {
            setDistance(0);
            return;
        }

        // Simulate distance readings (5cm to 200cm)
        const interval = setInterval(() => {
            // Simulate realistic distance with slight variations
            const baseDistance = 10 + Math.random() * 190; // 10-200cm
            const noise = (Math.random() - 0.5) * 2; // ±1cm noise
            const simulatedDistance = Math.max(5, Math.min(200, baseDistance + noise));

            setDistance(simulatedDistance);

            // Ping animation
            setIsPinging(true);
            setTimeout(() => setIsPinging(false), 100);

            // Notify parent component
            if (onDistanceUpdate) {
                onDistanceUpdate(simulatedDistance);
            }
        }, 500); // Update every 500ms

        return () => clearInterval(interval);
    }, [isSimulating, onDistanceUpdate]);

    return (
        <div className="relative">
            {/* Ultrasonic sensor visualization */}
            <div className="relative">
                {/* Show distance when simulating */}
                {isSimulating && (
                    <div
                        className="absolute -top-8 left-1/2 transform -translate-x-1/2 bg-blue-500 text-white px-2 py-1 rounded text-xs font-mono whitespace-nowrap z-10"
                        style={{
                            opacity: isPinging ? 1 : 0.7,
                            transition: 'opacity 0.1s',
                        }}
                    >
                        {distance.toFixed(1)} cm
                    </div>
                )}

                {/* Ping wave animation */}
                {isSimulating && isPinging && (
                    <div
                        className="absolute top-0 left-1/2 transform -translate-x-1/2 w-4 h-4 bg-blue-300 rounded-full opacity-50 animate-ping"
                        style={{ pointerEvents: 'none' }}
                    />
                )}
            </div>
        </div>
    );
};
