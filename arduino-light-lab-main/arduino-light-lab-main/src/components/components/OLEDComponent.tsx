/**
 * OLED 128x64 Display Component
 * 
 * Renders a 128x64 pixel OLED display using the actual SVG image
 * with a pixel overlay for simulation display.
 * 
 * Features:
 * - Uses the actual oled-128x64.svg image
 * - Overlays real-time pixels from OLEDEngine during simulation
 * - Proper OLED appearance (cyan pixels on black background)
 */

import React, { useEffect, useState, useMemo } from 'react';
import { getOLEDEngine, OLEDDisplayBuffer } from '../../simulation/OLEDEngine';

interface OLEDComponentProps {
    x: number;
    y: number;
    rotation?: number;
    instanceId: string;
    width?: number;
    height?: number;
    isSimulating?: boolean;
}

// OLED display dimensions (pixel grid)
const DISPLAY_WIDTH = 128;
const DISPLAY_HEIGHT = 64;

// SVG original dimensions
const SVG_WIDTH = 400;
const SVG_HEIGHT = 320;

// Display screen area within SVG (from SVG analysis)
// The display area starts at (10, 65) and is 380x220
const SCREEN_X = 25;      // Left padding inside screen
const SCREEN_Y = 80;      // Top of display area
const SCREEN_W = 350;     // Display width
const SCREEN_H = 190;     // Display height

// Pixel sizing within the display area
const PIXEL_W = SCREEN_W / DISPLAY_WIDTH;   // ~2.73 per pixel
const PIXEL_H = SCREEN_H / DISPLAY_HEIGHT;  // ~2.97 per pixel

const OLEDComponent: React.FC<OLEDComponentProps> = ({
    x,
    y,
    rotation = 0,
    instanceId,
    width = 90,
    height = 70,
    isSimulating = false,
}) => {
    const [displayBuffer, setDisplayBuffer] = useState<OLEDDisplayBuffer | null>(null);

    // Subscribe to OLED updates
    useEffect(() => {
        if (!isSimulating) return;

        const oledEngine = getOLEDEngine();

        // Get initial state
        const initialBuffer = oledEngine.getDisplayBuffer(instanceId);
        if (initialBuffer) {
            setDisplayBuffer(initialBuffer);
        }

        // Subscribe to updates
        const unsubscribe = oledEngine.onUpdate((id, buffer) => {
            if (id === instanceId) {
                setDisplayBuffer(buffer);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [instanceId, isSimulating]);

    // Memoize pixel rendering for performance
    const pixelElements = useMemo(() => {
        if (!displayBuffer || !displayBuffer.isOn || !isSimulating) {
            return null;
        }

        const elements: JSX.Element[] = [];
        const contrast = displayBuffer.contrast / 255;

        // Map Arduino color names to RGB values
        const colorMap: Record<string, string> = {
            'WHITE': `rgba(255, 255, 255, ${0.85 + contrast * 0.15})`,
            'YELLOW': `rgba(255, 255, 0, ${0.85 + contrast * 0.15})`,
            'BLUE': `rgba(0, 150, 255, ${0.85 + contrast * 0.15})`,
            'CYAN': `rgba(0, 255, 255, ${0.85 + contrast * 0.15})`,
            'GREEN': `rgba(0, 255, 0, ${0.85 + contrast * 0.15})`,
            'RED': `rgba(255, 50, 50, ${0.85 + contrast * 0.15})`,
            'MAGENTA': `rgba(255, 0, 255, ${0.85 + contrast * 0.15})`,
            'ORANGE': `rgba(255, 165, 0, ${0.85 + contrast * 0.15})`,
        };

        // Get pixel color based on textColor from Arduino code
        const textColor = displayBuffer.textColor?.toUpperCase() || 'WHITE';
        const pixelOnColor = colorMap[textColor] || colorMap['WHITE'];

        // Render pixels using run-length encoding for efficiency
        for (let py = 0; py < DISPLAY_HEIGHT; py++) {
            let runStart = -1;

            for (let px = 0; px <= DISPLAY_WIDTH; px++) {
                const isOn = px < DISPLAY_WIDTH && displayBuffer.pixels[px]?.[py];

                if (isOn && runStart === -1) {
                    runStart = px;
                } else if (!isOn && runStart !== -1) {
                    const runLength = px - runStart;

                    if (runLength > 0) {
                        elements.push(
                            <rect
                                key={`${runStart}-${py}`}
                                x={SCREEN_X + runStart * PIXEL_W}
                                y={SCREEN_Y + py * PIXEL_H}
                                width={runLength * PIXEL_W}
                                height={PIXEL_H}
                                fill={pixelOnColor}
                            />
                        );
                    }
                    runStart = -1;
                }
            }
        }

        return elements;
    }, [displayBuffer, isSimulating]);

    // Calculate display rotation transform (0, 90, 180, 270 degrees)
    const displayRotation = displayBuffer?.rotation || 0;
    const displayRotationDeg = displayRotation * 90;

    // Calculate the center point for rotation (center of display area)
    const displayCenterX = SVG_WIDTH / 2;
    const displayCenterY = SVG_HEIGHT / 2;

    return (
        <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
            {/* Use the actual OLED SVG image as background */}
            <image
                href="/components/oled-128x64.svg"
                x="0"
                y="0"
                width={width}
                height={height}
                preserveAspectRatio="xMidYMid meet"
            />

            {/* Overlay pixel display during simulation */}
            {isSimulating && displayBuffer?.isOn && (
                <svg
                    x="0"
                    y="0"
                    width={width}
                    height={height}
                    viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{
                        transformOrigin: `${displayCenterX}px ${displayCenterY}px`,
                        transform: `rotate(${displayRotationDeg}deg)`
                    }}
                >
                    {pixelElements}
                </svg>
            )}
        </g>
    );
};

export default OLEDComponent;
