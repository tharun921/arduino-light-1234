/**
 * Wire Routing Utilities
 * Generates smooth Bezier curve paths for component wiring
 */

export type PinDirection = 'left' | 'right' | 'top' | 'bottom';

export interface PinCoordinate {
    x: number;
    y: number;
    direction: PinDirection;
}

/**
 * Calculate control point based on pin direction
 * Control point extends outward from the pin in its facing direction
 */
function getControlPoint(pin: PinCoordinate, distance: number = 40): { x: number; y: number } {
    switch (pin.direction) {
        case 'right':
            return { x: pin.x + distance, y: pin.y };
        case 'left':
            return { x: pin.x - distance, y: pin.y };
        case 'top':
            return { x: pin.x, y: pin.y - distance };
        case 'bottom':
            return { x: pin.x, y: pin.y + distance };
    }
}

/**
 * Generate smooth Bezier curve path between two pins
 * Uses pin directions to create natural-looking curves
 */
export function generateBezierPath(
    startPin: PinCoordinate,
    endPin: PinCoordinate
): string {
    const startX = startPin.x;
    const startY = startPin.y;
    const endX = endPin.x;
    const endY = endPin.y;

    // Calculate distance to determine control point offset
    const dx = endX - startX;
    const dy = endY - startY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    // Control point distance scales with wire length
    // Minimum 40px, maximum 150px
    const controlDistance = Math.min(Math.max(distance * 0.4, 40), 150);

    // Get control points based on pin directions
    const cp1 = getControlPoint(startPin, controlDistance);
    const cp2 = getControlPoint(endPin, controlDistance);

    // Generate SVG path with cubic Bezier curve
    // M = Move to start point
    // C = Cubic Bezier curve with two control points
    return `M ${startX} ${startY} C ${cp1.x} ${cp1.y}, ${cp2.x} ${cp2.y}, ${endX} ${endY}`;
}

/**
 * Determine wire color based on pin type
 */
export function getWireColor(pinId: string): string {
    const pin = pinId.toLowerCase();

    // Power pins - RED
    if (pin.includes('vcc') || pin.includes('5v') || pin.includes('power')) {
        return '#FF0000';
    }

    // Ground pins - BLACK
    if (pin.includes('gnd') || pin.includes('ground')) {
        return '#000000';
    }

    // Signal pins - by type
    if (pin.includes('trig')) return '#00FF00'; // GREEN
    if (pin.includes('echo')) return '#0000FF'; // BLUE
    if (pin.includes('data')) return '#FFA500'; // ORANGE
    if (pin.includes('rx')) return '#9C27B0'; // PURPLE
    if (pin.includes('tx')) return '#FF9800'; // ORANGE

    // Default signal - GRAY
    return '#808080';
}

/**
 * Automatically determine pin direction based on component position
 * Uses heuristics to guess the most likely pin direction
 */
export function inferPinDirection(
    pinX: number,
    pinY: number,
    componentX: number,
    componentY: number,
    componentWidth: number,
    componentHeight: number
): PinDirection {
    // Calculate relative position of pin to component center
    const centerX = componentX + componentWidth / 2;
    const centerY = componentY + componentHeight / 2;

    const relativeX = pinX - centerX;
    const relativeY = pinY - centerY;

    // Determine which edge the pin is closest to
    const absX = Math.abs(relativeX);
    const absY = Math.abs(relativeY);

    if (absX > absY) {
        // Pin is on left or right edge
        return relativeX > 0 ? 'right' : 'left';
    } else {
        // Pin is on top or bottom edge
        return relativeY > 0 ? 'bottom' : 'top';
    }
}
