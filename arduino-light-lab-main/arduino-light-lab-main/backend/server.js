const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compiler = require('./compiler/ArduinoCompiler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Allow large circuit data

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/arduino-lab';

mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch((err) => console.error('❌ MongoDB connection error:', err));


// Project Schema
const ProjectSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    components: {
        type: Array,
        required: true,
        default: []
    },
    wires: {
        type: Array,
        required: true,
        default: []
    },
    code: {
        type: String,
        default: ''
    }
}, {
    timestamps: true  // Adds createdAt and updatedAt
});

const Project = mongoose.model('Project', ProjectSchema);

// ============== API ROUTES ==============

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', message: 'Backend server is running' });
});

// GET all projects
app.get('/api/projects', async (req, res) => {
    try {
        const projects = await Project.find()
            .select('_id name description createdAt updatedAt')
            .sort({ updatedAt: -1 });

        res.json({
            success: true,
            projects
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch projects',
            error: error.message
        });
    }
});

// GET single project by ID
app.get('/api/projects/:id', async (req, res) => {
    try {
        const project = await Project.findById(req.params.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        res.json({
            success: true,
            project
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch project',
            error: error.message
        });
    }
});

// POST new project (Save)
app.post('/api/projects', async (req, res) => {
    try {
        const { name, description, components, wires, code } = req.body;

        // Validation
        if (!name || !components) {
            return res.status(400).json({
                success: false,
                message: 'Name and components are required'
            });
        }

        const project = new Project({
            name,
            description,
            components,
            wires: wires || [],
            code: code || ''
        });

        await project.save();

        res.status(201).json({
            success: true,
            message: 'Project saved successfully',
            projectId: project._id,
            project
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to save project',
            error: error.message
        });
    }
});

// PUT update project
app.put('/api/projects/:id', async (req, res) => {
    try {
        const { name, description, components, wires, code } = req.body;

        const project = await Project.findByIdAndUpdate(
            req.params.id,
            { name, description, components, wires, code },
            { new: true, runValidators: true }
        );

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        res.json({
            success: true,
            message: 'Project updated successfully',
            project
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to update project',
            error: error.message
        });
    }
});

// ============== ARDUINO COMPILER ROUTES ==============

// GET compiler status - Check if Arduino CLI is available
app.get('/api/compile/check', async (req, res) => {
    try {
        const status = await compiler.checkArduinoCLI();
        res.json({
            success: true,
            ...status
        });
    } catch (error) {
        res.json({
            success: false,
            available: false,
            error: error.message
        });
    }
});

// POST compile Arduino code
app.post('/api/compile', async (req, res) => {
    try {
        const { code, board } = req.body;

        // Validation
        if (!code || typeof code !== 'string') {
            return res.status(400).json({
                success: false,
                error: 'Code is required and must be a string'
            });
        }

        console.log('\n' + '='.repeat(60));
        console.log('📨 Compilation request received');
        console.log('📋 Board:', board || 'arduino:avr:uno');
        console.log('📝 Code length:', code.length, 'characters');
        console.log('='.repeat(60));

        // Compile the code
        const result = await compiler.compileArduinoCode(code, board);

        if (result.success) {
            console.log('✅ Compilation successful - sending response');
            res.json(result);
        } else {
            console.log('❌ Compilation failed - sending errors');
            res.status(400).json(result);
        }
    } catch (error) {
        console.error('💥 Server error during compilation:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error during compilation',
            message: error.message
        });
    }
});

// ============== LIBRARY MANAGER ROUTES ==============

const libraryRoutes = require('./routes/libraries');
app.use('/api/libraries', libraryRoutes);

// ============== PROJECT MANAGEMENT ==============

// DELETE project

app.delete('/api/projects/:id', async (req, res) => {
    try {
        const project = await Project.findByIdAndDelete(req.params.id);

        if (!project) {
            return res.status(404).json({
                success: false,
                message: 'Project not found'
            });
        }

        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to delete project',
            error: error.message
        });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`🚀 Backend server running on http://localhost:${PORT}`);
    console.log(`📂 MongoDB: ${MONGODB_URI}`);
});
