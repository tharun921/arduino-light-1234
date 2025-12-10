// Project Management Utilities for Browser Storage

export interface Project {
    id: string;
    name: string;
    description?: string;
    components: any[];
    wires: any[];
    code: string;
    createdAt: number;
    updatedAt: number;
}

const PROJECTS_KEY = 'arduino-projects';
const CURRENT_PROJECT_KEY = 'arduino-current-project';

// Get all saved projects
export const getAllProjects = (): Project[] => {
    try {
        const projectsJson = localStorage.getItem(PROJECTS_KEY);
        return projectsJson ? JSON.parse(projectsJson) : [];
    } catch (error) {
        console.error('Failed to load projects:', error);
        return [];
    }
};

// Save a new project or update existing
export const saveProject = (project: Omit<Project, 'id' | 'createdAt' | 'updatedAt'>): Project => {
    const projects = getAllProjects();
    const now = Date.now();

    // Check if project with same name exists
    const existingIndex = projects.findIndex(p => p.name === project.name);

    let savedProject: Project;

    if (existingIndex >= 0) {
        // Update existing project
        savedProject = {
            ...projects[existingIndex],
            ...project,
            updatedAt: now
        };
        projects[existingIndex] = savedProject;
    } else {
        // Create new project
        savedProject = {
            ...project,
            id: `project-${now}`,
            createdAt: now,
            updatedAt: now
        };
        projects.push(savedProject);
    }

    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
    return savedProject;
};

// Load a specific project
export const loadProject = (projectId: string): Project | null => {
    const projects = getAllProjects();
    return projects.find(p => p.id === projectId) || null;
};

// Delete a project
export const deleteProject = (projectId: string): boolean => {
    try {
        const projects = getAllProjects();
        const filteredProjects = projects.filter(p => p.id !== projectId);
        localStorage.setItem(PROJECTS_KEY, JSON.stringify(filteredProjects));
        return true;
    } catch (error) {
        console.error('Failed to delete project:', error);
        return false;
    }
};

// Set current project ID
export const setCurrentProjectId = (projectId: string | null) => {
    if (projectId) {
        localStorage.setItem(CURRENT_PROJECT_KEY, projectId);
    } else {
        localStorage.removeItem(CURRENT_PROJECT_KEY);
    }
};

// Get current project ID
export const getCurrentProjectId = (): string | null => {
    return localStorage.getItem(CURRENT_PROJECT_KEY);
};

// Auto-save current work to a temporary project
export const autoSaveCurrentWork = (components: any[], wires: any[], code: string) => {
    const currentProjectId = getCurrentProjectId();

    if (currentProjectId) {
        // Update existing project
        const project = loadProject(currentProjectId);
        if (project) {
            saveProject({
                name: project.name,
                description: project.description,
                components,
                wires,
                code
            });
        }
    } else {
        // Save to temporary auto-save slot
        localStorage.setItem('arduino-circuit', JSON.stringify({
            components,
            wires,
            code,
            timestamp: Date.now()
        }));
    }
};
