import React, { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { X, Search, Download, Upload, Package, CheckCircle, Loader2 } from 'lucide-react';
import { Button } from './ui/button';

interface Library {
    name: string;
    version: string;
    author: string;
    sentence: string;
    paragraph: string;
    category: string;
    installed?: boolean;
}

interface LibraryManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const LibraryManager: React.FC<LibraryManagerProps> = ({ isOpen, onClose }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [libraries, setLibraries] = useState<Library[]>([]);
    const [installedLibraries, setInstalledLibraries] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'search' | 'upload'>('search');

    // Fetch installed libraries on mount
    useEffect(() => {
        if (isOpen) {
            fetchInstalledLibraries();
        }
    }, [isOpen]);

    const fetchInstalledLibraries = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/libraries/list');
            const data = await response.json();

            if (data.success && data.libraries) {
                const installedNames = new Set<string>(data.libraries.map((lib: any) => lib.name));
                setInstalledLibraries(installedNames);
            }
        } catch (error) {
            console.error('Failed to fetch installed libraries:', error);
        }
    };

    const searchLibraries = async () => {
        if (!searchQuery.trim()) {
            setLibraries([]);
            return;
        }

        setLoading(true);
        try {
            const response = await fetch(`http://localhost:3001/api/libraries/search?q=${encodeURIComponent(searchQuery)}`);
            const data = await response.json();

            if (data.success && data.libraries) {
                // Mark which libraries are installed
                const librariesWithStatus = data.libraries.map((lib: Library) => ({
                    ...lib,
                    installed: installedLibraries.has(lib.name)
                }));
                setLibraries(librariesWithStatus);
            }
        } catch (error) {
            console.error('Failed to search libraries:', error);
            toast.error('Failed to search libraries');
        } finally {
            setLoading(false);
        }
    };

    const installLibrary = async (libraryName: string) => {
        setInstalling(libraryName);
        try {
            const response = await fetch('http://localhost:3001/api/libraries/install', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: libraryName })
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`✅ ${libraryName} installed successfully!`);

                // Update installed libraries set
                setInstalledLibraries(prev => new Set([...prev, libraryName]));

                // Update library list
                setLibraries(prev => prev.map(lib =>
                    lib.name === libraryName ? { ...lib, installed: true } : lib
                ));
            } else {
                toast.error(`Failed to install ${libraryName}: ${data.error}`);
            }
        } catch (error) {
            console.error('Failed to install library:', error);
            toast.error(`Failed to install ${libraryName}`);
        } finally {
            setInstalling(null);
        }
    };

    const handleZipUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!file.name.endsWith('.zip')) {
            toast.error('Please upload a .zip file');
            return;
        }

        const formData = new FormData();
        formData.append('library', file);

        setLoading(true);
        try {
            const response = await fetch('http://localhost:3001/api/libraries/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                toast.success(`✅ Library installed from ${file.name}`);
                fetchInstalledLibraries(); // Refresh installed libraries
            } else {
                toast.error(`Failed to install library: ${data.error}`);
            }
        } catch (error) {
            console.error('Failed to upload library:', error);
            toast.error('Failed to upload library');
        } finally {
            setLoading(false);
            // Reset file input
            event.target.value = '';
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-white/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Package className="w-5 h-5" />
                        Library Manager
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b">
                    <button
                        onClick={() => setActiveTab('search')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'search'
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        <Search className="w-4 h-4 inline mr-2" />
                        Search & Install
                    </button>
                    <button
                        onClick={() => setActiveTab('upload')}
                        className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${activeTab === 'upload'
                            ? 'border-b-2 border-blue-500 text-blue-600'
                            : 'text-gray-600 hover:text-gray-900'
                            }`}
                    >
                        <Upload className="w-4 h-4 inline mr-2" />
                        Upload ZIP
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4">
                    {activeTab === 'search' ? (
                        <>
                            {/* Search Bar */}
                            <div className="flex gap-2 mb-4">
                                <div className="flex-1 relative">
                                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Search libraries (e.g., LiquidCrystal, DHT, Servo)..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && searchLibraries()}
                                        className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <Button onClick={searchLibraries} disabled={loading || !searchQuery.trim()}>
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
                                </Button>
                            </div>

                            {/* Library Results */}
                            <div className="space-y-3">
                                {loading && libraries.length === 0 && (
                                    <div className="text-center py-8 text-gray-500">
                                        <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                                        Searching libraries...
                                    </div>
                                )}

                                {!loading && libraries.length === 0 && searchQuery && (
                                    <div className="text-center py-8 text-gray-500">
                                        No libraries found for "{searchQuery}"
                                    </div>
                                )}

                                {!loading && libraries.length === 0 && !searchQuery && (
                                    <div className="text-center py-8 text-gray-500">
                                        <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                        <p>Search for Arduino libraries above</p>
                                        <p className="text-sm mt-2">Try: LiquidCrystal, DHT, Servo, NewPing</p>
                                    </div>
                                )}

                                {libraries.map((lib) => (
                                    <div
                                        key={lib.name}
                                        className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                                    >
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <h3 className="font-semibold text-lg">{lib.name}</h3>
                                                    {lib.installed && (
                                                        <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
                                                            <CheckCircle className="w-3 h-3" />
                                                            Installed
                                                        </span>
                                                    )}
                                                    <span className="text-xs text-gray-500">v{lib.version}</span>
                                                </div>
                                                <p className="text-sm text-gray-600 mb-1">{lib.sentence}</p>
                                                <p className="text-xs text-gray-500">
                                                    Author: {lib.author} • Category: {lib.category}
                                                </p>
                                            </div>

                                            <div className="ml-4">
                                                {lib.installed ? (
                                                    <Button variant="outline" size="sm" disabled>
                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                        Installed
                                                    </Button>
                                                ) : (
                                                    <Button
                                                        onClick={() => installLibrary(lib.name)}
                                                        disabled={installing === lib.name}
                                                        size="sm"
                                                    >
                                                        {installing === lib.name ? (
                                                            <>
                                                                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                                                                Installing...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <Download className="w-4 h-4 mr-1" />
                                                                Install
                                                            </>
                                                        )}
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    ) : (
                        /* ZIP Upload Tab */
                        <div className="space-y-4">
                            <div className="text-center py-8">
                                <Upload className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                                <h3 className="text-lg font-semibold mb-2">Upload Library ZIP File</h3>
                                <p className="text-sm text-gray-600 mb-4">
                                    Upload a .zip file containing an Arduino library
                                </p>

                                <label className="inline-block">
                                    <input
                                        type="file"
                                        accept=".zip"
                                        onChange={handleZipUpload}
                                        className="hidden"
                                        disabled={loading}
                                    />
                                    <div className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 cursor-pointer transition-colors">
                                        {loading ? (
                                            <>
                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                Installing...
                                            </>
                                        ) : (
                                            <>
                                                <Upload className="w-5 h-5" />
                                                Choose ZIP File
                                            </>
                                        )}
                                    </div>
                                </label>

                                <div className="mt-6 text-left bg-gray-50 dark:bg-gray-900 p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2 text-sm">📝 Instructions:</h4>
                                    <ul className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                                        <li>1. Download library ZIP from source (e.g., GitHub releases)</li>
                                        <li>2. Click "Choose ZIP File" and select the .zip file</li>
                                        <li>3. Library will be automatically extracted and installed</li>
                                        <li>4. You can now use it in your Arduino code!</li>
                                    </ul>
                                </div>
                            </div>

                            {/* Installed Libraries List */}
                            <div className="border-t pt-4">
                                <h4 className="font-semibold mb-2">Installed Libraries:</h4>
                                {installedLibraries.size > 0 ? (
                                    <div className="grid grid-cols-2 gap-2">
                                        {Array.from(installedLibraries).map((libName) => (
                                            <div
                                                key={libName}
                                                className="flex items-center gap-2 text-sm p-2 bg-green-50 dark:bg-green-900/20 rounded"
                                            >
                                                <CheckCircle className="w-4 h-4 text-green-600" />
                                                <span>{libName}</span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-500">No libraries installed yet</p>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="border-t p-4 flex justify-between items-center">
                    <p className="text-sm text-gray-500">
                        {installedLibraries.size} libraries installed
                    </p>
                    <Button onClick={onClose}>Close</Button>
                </div>
            </div>
        </div>
    );
};
