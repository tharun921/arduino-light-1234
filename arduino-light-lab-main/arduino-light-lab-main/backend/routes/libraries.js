const express = require('express');
const router = express.Router();
const { exec } = require('child_process');
const util = require('util');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

const execPromise = util.promisify(exec);

// Ensure upload directory exists
const uploadDir = path.join(os.tmpdir(), 'arduino-lib-uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    console.log('📁 Created upload directory:', uploadDir);
}

// Configure multer for ZIP uploads
const upload = multer({
    dest: uploadDir,
    fileFilter: (req, file, cb) => {
        if (file.originalname.endsWith('.zip')) {
            cb(null, true);
        } else {
            cb(new Error('Only .zip files are allowed'));
        }
    },
    limits: {
        fileSize: 50 * 1024 * 1024 // 50MB max
    }
});

/**
 * GET /api/libraries/list
 * Get list of installed libraries
 */
router.get('/list', async (req, res) => {
    try {
        console.log('📚 Fetching installed libraries...');
        const { stdout } = await execPromise('arduino-cli lib list --format json');

        const libraries = JSON.parse(stdout || '[]');

        console.log(`✅ Found ${libraries.length} installed libraries`);

        res.json({
            success: true,
            libraries: libraries
        });
    } catch (error) {
        console.error('❌ Failed to list libraries:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            libraries: []
        });
    }
});

/**
 * GET /api/libraries/search?q=query
 * Search for libraries in Arduino library index
 */
router.get('/search', async (req, res) => {
    try {
        const { q } = req.query;

        if (!q) {
            return res.status(400).json({
                success: false,
                error: 'Search query is required'
            });
        }

        console.log(`🔍 Searching libraries for: "${q}"`);

        const { stdout } = await execPromise(`arduino-cli lib search "${q}" --format json`);

        const results = JSON.parse(stdout || '{"libraries":[]}');
        const libraries = results.libraries || [];

        console.log(`✅ Found ${libraries.length} libraries matching "${q}"`);

        res.json({
            success: true,
            libraries: libraries
        });
    } catch (error) {
        console.error('❌ Library search failed:', error);
        res.status(500).json({
            success: false,
            error: error.message,
            libraries: []
        });
    }
});

/**
 * POST /api/libraries/install
 * Install a library from Arduino library index
 */
router.post('/install', async (req, res) => {
    try {
        const { name } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                error: 'Library name is required'
            });
        }

        console.log(`📥 Installing library: ${name}`);

        const { stdout, stderr } = await execPromise(`arduino-cli lib install "${name}"`);

        console.log(`✅ Library "${name}" installed successfully`);
        console.log('Output:', stdout);

        res.json({
            success: true,
            message: `Library "${name}" installed successfully`,
            output: stdout
        });
    } catch (error) {
        console.error(`❌ Failed to install library "${req.body.name}":`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/libraries/upload
 * Install a library from uploaded ZIP file
 */
router.post('/upload', upload.single('library'), async (req, res) => {
    let tempFilePath = null;

    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                error: 'No file uploaded. Please select a .zip file containing an Arduino library.'
            });
        }

        tempFilePath = req.file.path;
        const originalName = req.file.originalname;
        const fileSize = (req.file.size / 1024).toFixed(2);

        console.log(`📤 Installing library from ZIP: ${originalName} (${fileSize} KB)`);
        console.log(`   Temp file: ${tempFilePath}`);

        // Verify ZIP file exists
        if (!fs.existsSync(tempFilePath)) {
            throw new Error('Uploaded file not found');
        }

        // Check if arduino-cli is available
        try {
            await execPromise('arduino-cli version');
        } catch (cliError) {
            throw new Error('arduino-cli not found. Please ensure it is installed and in your PATH.');
        }

        // Enable unsafe library installation (required for --zip-path)
        console.log('🔧 Enabling unsafe library installation...');
        try {
            await execPromise('arduino-cli config set library.enable_unsafe_install true');
            console.log('✅ Unsafe install enabled');
        } catch (configError) {
            console.warn('⚠️ Could not enable unsafe install, trying anyway:', configError.message);
        }

        // Install library from ZIP
        console.log('🔧 Running: arduino-cli lib install --zip-path...');
        const { stdout, stderr } = await execPromise(`arduino-cli lib install --zip-path "${tempFilePath}"`);

        console.log(`✅ Library installed from ${originalName}`);
        if (stdout) console.log('Output:', stdout);
        if (stderr) console.log('Stderr:', stderr);

        // Cleanup temp file
        fs.unlinkSync(tempFilePath);
        console.log('🗑️ Cleaned up temp file');

        res.json({
            success: true,
            message: `Library successfully installed from ${originalName}`,
            output: stdout || 'Library installed'
        });
    } catch (error) {
        console.error('❌ Failed to install library from ZIP:');
        console.error('   Error:', error.message);
        if (error.stderr) console.error('   Stderr:', error.stderr);

        // Cleanup temp file on error
        if (tempFilePath && fs.existsSync(tempFilePath)) {
            try {
                fs.unlinkSync(tempFilePath);
                console.log('🗑️ Cleaned up temp file after error');
            } catch (cleanupError) {
                console.error('⚠️ Failed to cleanup temp file:', cleanupError.message);
            }
        }

        res.status(500).json({
            success: false,
            error: error.message || 'Failed to install library',
            details: error.stderr || undefined
        });
    }
});

/**
 * DELETE /api/libraries/:name
 * Uninstall a library
 */
router.delete('/:name', async (req, res) => {
    try {
        const { name } = req.params;

        console.log(`🗑️ Uninstalling library: ${name}`);

        const { stdout } = await execPromise(`arduino-cli lib uninstall "${name}"`);

        console.log(`✅ Library "${name}" uninstalled`);

        res.json({
            success: true,
            message: `Library "${name}" uninstalled successfully`
        });
    } catch (error) {
        console.error(`❌ Failed to uninstall library "${req.params.name}":`, error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
