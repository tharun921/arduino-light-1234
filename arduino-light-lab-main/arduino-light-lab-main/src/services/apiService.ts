// API Service for Backend Communication
const API_URL = 'http://localhost:3001/api';

export interface ProjectData {
    name: string;
    description?: string;
    components: any[];
    wires: any[];
    code?: string;
}

export interface Project extends ProjectData {
    _id: string;
    createdAt: string;
    updatedAt: string;
}

// Save new project
export const saveProject = async (projectData: ProjectData): Promise<{ success: boolean; projectId: string; project: Project }> => {
    const response = await fetch(`${API_URL}/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
    });

    if (!response.ok) {
        throw new Error('Failed to save project');
    }

    return response.json();
};

// Load single project by ID
export const loadProject = async (projectId: string): Promise<{ success: boolean; project: Project }> => {
    const response = await fetch(`${API_URL}/projects/${projectId}`);

    if (!response.ok) {
        throw new Error('Failed to load project');
    }

    return response.json();
};

// List all projects
export const listProjects = async (): Promise<{ success: boolean; projects: Partial<Project>[] }> => {
    const response = await fetch(`${API_URL}/projects`);

    if (!response.ok) {
        throw new Error('Failed to fetch projects');
    }

    return response.json();
};

// Update existing project
export const updateProject = async (projectId: string, projectData: ProjectData): Promise<{ success: boolean; project: Project }> => {
    const response = await fetch(`${API_URL}/projects/${projectId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(projectData)
    });

    if (!response.ok) {
        throw new Error('Failed to update project');
    }

    return response.json();
};

// Delete project
export const deleteProject = async (projectId: string): Promise<{ success: boolean }> => {
    const response = await fetch(`${API_URL}/projects/${projectId}`, {
        method: 'DELETE'
    });

    if (!response.ok) {
        throw new Error('Failed to delete project');
    }

    return response.json();
};

// Health check
export const checkBackendHealth = async (): Promise<boolean> => {
    try {
        const response = await fetch(`${API_URL}/health`);
        const data = await response.json();
        return data.status === 'OK';
    } catch (error) {
        return false;
    }
};
