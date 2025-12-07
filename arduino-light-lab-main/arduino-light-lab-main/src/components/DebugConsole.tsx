import React, { useEffect, useRef } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from './ui/button';

export interface DebugLog {
    id: string;
    timestamp: number;
    type: 'info' | 'sensor' | 'serial' | 'error';
    message: string;
    value?: number;
}

interface DebugConsoleProps {
    logs: DebugLog[];
    isExpanded: boolean;
    height: number;
    onToggle: () => void;
    onHeightChange: (height: number) => void;
    onClear: () => void;
}

export const DebugConsole: React.FC<DebugConsoleProps> = ({
    logs,
    isExpanded,
    height,
    onToggle,
    onHeightChange,
    onClear,
}) => {
    const logContainerRef = useRef<HTMLDivElement>(null);
    const resizeHandleRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (logContainerRef.current && isExpanded) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [logs, isExpanded]);

    // Handle resize dragging
    useEffect(() => {
        const handle = resizeHandleRef.current;
        if (!handle) return;

        let startY = 0;
        let startHeight = 0;

        const onMouseDown = (e: MouseEvent) => {
            startY = e.clientY;
            startHeight = height;
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
            e.preventDefault();
        };

        const onMouseMove = (e: MouseEvent) => {
            const deltaY = startY - e.clientY;
            const newHeight = Math.min(Math.max(startHeight + deltaY, 100), 400);
            onHeightChange(newHeight);
        };

        const onMouseUp = () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };

        handle.addEventListener('mousedown', onMouseDown);
        return () => handle.removeEventListener('mousedown', onMouseDown);
    }, [height, onHeightChange]);

    const formatTime = (timestamp: number) => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString('en-US', { hour12: false });
    };

    const getLogColor = (type: DebugLog['type']) => {
        switch (type) {
            case 'info': return 'text-blue-400';
            case 'sensor': return 'text-green-400';
            case 'serial': return 'text-gray-200';
            case 'error': return 'text-red-400';
            default: return 'text-gray-200';
        }
    };

    const getLogIcon = (type: DebugLog['type']) => {
        switch (type) {
            case 'info': return '🔵';
            case 'sensor': return '📡';
            case 'serial': return '📝';
            case 'error': return '❌';
            default: return '•';
        }
    };

    return (
        <div
            className="fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-700 shadow-lg"
            style={{
                height: isExpanded ? `${height}px` : '32px',
                zIndex: 100,
                transition: 'height 0.2s ease'
            }}
        >
            {/* Resize Handle */}
            {isExpanded && (
                <div
                    ref={resizeHandleRef}
                    className="absolute top-0 left-0 right-0 h-1 bg-gray-700 hover:bg-blue-500 cursor-ns-resize transition-colors"
                />
            )}

            {/* Header Bar */}
            <div
                className="flex items-center justify-between px-4 h-8 bg-gray-800 cursor-pointer hover:bg-gray-750"
                onClick={onToggle}
            >
                <div className="flex items-center gap-2 text-sm font-medium text-gray-200">
                    {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                    <span>Debug Console</span>
                    <span className="text-gray-500 text-xs">({logs.length} logs)</span>
                </div>
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-gray-400 hover:text-red-400"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClear();
                    }}
                >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Clear
                </Button>
            </div>

            {/* Log Container */}
            {isExpanded && (
                <div
                    ref={logContainerRef}
                    className="overflow-y-auto p-2 font-mono text-xs"
                    style={{ height: `${height - 32}px` }}
                >
                    {logs.length === 0 ? (
                        <div className="text-gray-500 text-center py-4">
                            No logs yet. Start the simulation to see output.
                        </div>
                    ) : (
                        logs.map((log) => (
                            <div key={log.id} className="py-0.5 hover:bg-gray-800">
                                <span className="text-gray-500">[{formatTime(log.timestamp)}]</span>{' '}
                                <span>{getLogIcon(log.type)}</span>{' '}
                                <span className={getLogColor(log.type)}>
                                    {log.message}
                                    {log.value !== undefined && `: ${log.value.toFixed(2)}`}
                                </span>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};
