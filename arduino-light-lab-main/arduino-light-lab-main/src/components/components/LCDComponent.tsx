import React from 'react';

interface LCDComponentProps {
    x: number;
    y: number;
    rotation?: number;
    lcdText?: {
        line1: string;
        line2: string;
    };
}

const LCDComponent: React.FC<LCDComponentProps> = ({ x, y, rotation = 0, lcdText }) => {
    const line1 = lcdText?.line1 || '';
    const line2 = lcdText?.line2 || '';

    return (
        <g transform={`translate(${x}, ${y}) rotate(${rotation})`}>
            {/* LCD 16x2 Display - 180x80px */}

            {/* Main PCB - Green board */}
            <rect
                x="0"
                y="0"
                width="180"
                height="80"
                fill="#2a7f2f"
                stroke="#1a5f1f"
                strokeWidth="2"
                rx="3"
            />

            {/* LCD Screen area - Yellow-green display */}
            <rect
                x="10"
                y="12"
                width="160"
                height="45"
                fill="#9acd32"
                stroke="#2a7f2f"
                strokeWidth="2"
                rx="2"
            />

            {/* LCD Display segments - darker area */}
            <rect
                x="15"
                y="17"
                width="150"
                height="35"
                fill="#b0e040"
                opacity="0.7"
                rx="1"
            />

            {/* LCD Text Display */}
            {/* Line 1 */}
            <text
                x="20"
                y="32"
                fontSize="11"
                fill="#000000"
                fontFamily="monospace"
                fontWeight="bold"
                letterSpacing="1"
            >
                {line1}
            </text>

            {/* Line 2 */}
            <text
                x="20"
                y="47"
                fontSize="11"
                fill="#000000"
                fontFamily="monospace"
                fontWeight="bold"
                letterSpacing="1"
            >
                {line2}
            </text>

            {/* Mounting holes */}
            <circle cx="8" cy="8" r="3" fill="#1a5f1f" />
            <circle cx="172" cy="8" r="3" fill="#1a5f1f" />
            <circle cx="8" cy="72" r="3" fill="#1a5f1f" />
            <circle cx="172" cy="72" r="3" fill="#1a5f1f" />

            {/* Pin header labels - bottom */}
            <text x="15" y="70" fontSize="6" fill="white" fontFamily="monospace">VSS</text>
            <text x="28" y="70" fontSize="6" fill="white" fontFamily="monospace">VDD</text>
            <text x="43" y="70" fontSize="6" fill="white" fontFamily="monospace">V0</text>
            <text x="58" y="70" fontSize="6" fill="white" fontFamily="monospace">RS</text>
            <text x="72" y="70" fontSize="6" fill="white" fontFamily="monospace">RW</text>
            <text x="88" y="70" fontSize="6" fill="white" fontFamily="monospace">E</text>
            <text x="102" y="70" fontSize="6" fill="white" fontFamily="monospace">D4</text>
            <text x="116" y="70" fontSize="6" fill="white" fontFamily="monospace">D5</text>
            <text x="130" y="70" fontSize="6" fill="white" fontFamily="monospace">D6</text>
            <text x="144" y="70" fontSize="6" fill="white" fontFamily="monospace">D7</text>
            <text x="159" y="70" fontSize="6" fill="white" fontFamily="monospace">A</text>
            <text x="169" y="70" fontSize="6" fill="white" fontFamily="monospace">K</text>

            {/* Pin connectors - bottom */}
            {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((i) => (
                <rect
                    key={i}
                    x={12 + i * 10.5}
                    y="73"
                    width="6"
                    height="7"
                    fill="#d4af37"
                    stroke="#aa8f27"
                    strokeWidth="0.5"
                />
            ))}
        </g>
    );
};

export default LCDComponent;
