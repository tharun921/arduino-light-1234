import React, { useEffect, useRef } from 'react';

interface ServoComponentProps {
    angle?: number; // 0-180 degrees
    width?: number;
    height?: number;
    id?: string;    // ✅ Added ID for unique React keys
}

export const ServoComponent: React.FC<ServoComponentProps> = React.memo(({
    angle = 90,
    width = 100,
    height = 120,
    id
}) => {
    const hornRef = useRef<SVGGElement>(null);
    // ✅ Use a ref to track the last applied rotation to avoid jitter/flicker
    const lastAppliedRotation = useRef<number | null>(null);

    useEffect(() => {
        if (hornRef.current) {
            // Convert servo angle (0-180) to rotation (-90 to +90)
            const rotation = angle - 90;

            // ✅ Only update the DOM if the change is significant (prevents flickering/invisible horn)
            // This matches the 0.1° threshold in ServoEngine
            if (lastAppliedRotation.current === null || Math.abs(lastAppliedRotation.current - rotation) > 0.1) {
                hornRef.current.style.transform = `rotate(${rotation}deg)`;
                lastAppliedRotation.current = rotation;
                console.log(`✅ Servo horn rotating to ${angle}° (${rotation}° rotation)`);
            }
        }
    }, [angle]);

    return (
        <svg
            width={width}
            height={height}
            viewBox="0 0 100 120"
            xmlns="http://www.w3.org/2000/svg"
            style={{ overflow: 'visible' }}  // ✅ Prevent clipping of rotating horn
        >
            {/* Wire Connector Base */}
            <rect x="5" y="50" width="12" height="30" rx="2"
                fill="#2C2C2C" stroke="#1A1A1A" strokeWidth="0.5" />

            {/* Connector Pins (metallic) */}
            <rect x="7" y="53" width="8" height="2" fill="#E5E5E5" />
            <rect x="7" y="61" width="8" height="2" fill="#E5E5E5" />
            <rect x="7" y="69" width="8" height="2" fill="#E5E5E5" />

            {/* Wires (Orange, Red, Brown) */}
            <path d="M17 54 C22 54 25 57 30 57"
                stroke="#FF8C00" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M17 62 C22 62 25 62 30 62"
                stroke="#FF4500" strokeWidth="3" fill="none" strokeLinecap="round" />
            <path d="M17 70 C22 70 25 67 30 67"
                stroke="#8B4513" strokeWidth="3" fill="none" strokeLinecap="round" />

            {/* Servo Main Body */}
            <rect x="30" y="50" width="50" height="30" rx="3"
                fill="#5A5A5A" stroke="#3E3E3E" strokeWidth="1" />

            {/* Servo Side Extension (mount tab) */}
            <rect x="22" y="55" width="10" height="20" rx="2"
                fill="#4E4E4E" stroke="#3A3A3A" strokeWidth="0.5" />

            {/* Mount Hole on extension */}
            <circle cx="27" cy="65" r="2.5" fill="#1A1A1A" />

            {/* Mount Hole on body */}
            <circle cx="75" cy="65" r="2.5" fill="#1A1A1A" />

            {/* Body Details */}
            <rect x="35" y="55" width="35" height="20" rx="1" fill="#4A4A4A" />

            {/* Servo Shaft Base (circular center) */}
            <circle cx="60" cy="47" r="10" fill="#7A7A7A" stroke="#5A5A5A" strokeWidth="0.5" />
            <circle cx="60" cy="47" r="7" fill="#9A9A9A" />

            {/* Center Screw (X mark) */}
            <line x1="55" y1="42" x2="65" y2="52" stroke="#3A3A3A" strokeWidth="1.5" strokeLinecap="round" />
            <line x1="65" y1="42" x2="55" y2="52" stroke="#3A3A3A" strokeWidth="1.5" strokeLinecap="round" />

            {/* Servo Horn (ONLY THIS ROTATES) */}
            <g
                ref={hornRef}
                style={{
                    transformOrigin: '60px 47px', // Rotate around shaft center
                    // ✅ VERY SMOOTH ANIMATION: 0.8s ease-in-out for clearly visible movement
                    // This creates a slow, graceful motion that users can clearly see
                    transition: 'transform 0.8s ease-in-out',
                    // ✅ Optimizes browser rendering for smooth animation
                    willChange: 'transform'
                }}
            >
                {/* ✅ Changed to white (#FFFFFF) for better visibility */}
                <rect x="56" y="8" width="8" height="40" rx="4"
                    fill="#FFFFFF" stroke="#BEBEBE" strokeWidth="0.5" />

                {/* Horn Holes */}
                <circle cx="60" cy="15" r="2" fill="#666" />
                <circle cx="60" cy="25" r="2" fill="#666" />
                <circle cx="60" cy="35" r="2" fill="#666" />
            </g>

            {/* Label */}
            <text x="60" y="95" textAnchor="middle" fill="white" fontSize="6" fontWeight="bold">SG90</text>
        </svg>
    );
});
