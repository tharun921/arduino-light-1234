# Arduino Light Lab - Backend API

Backend server for persisting Arduino circuits to MongoDB database.

## Prerequisites

- **Node.js** (v18 or higher)
- **MongoDB** (local installation)

## MongoDB Installation

### Windows:

1. Download MongoDB Community Server:
   https://www.mongodb.com/try/download/community

2. Install MongoDB:
   - Run the installer
   - Choose "Complete" installation
   - Install as a Windows Service (recommended)

3. Verify installation:
   ```bash
   mongo --version
   ```

### Start MongoDB:

MongoDB should start automatically as a Windows service. If not:

```bash
net start MongoDB
```

## Backend Setup

1. Navigate to backend folder:
   ```bash
   cd backend
   ```

2. Dependencies are already installed!

3. Start the backend server:
   ```bash
   npm run dev
   ```

Server will run on: **http://localhost:3001**

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get specific project |
| `POST` | `/api/projects` | Save new project |
| `PUT` | `/api/projects/:id` | Update project |
| `DELETE` | `/api/projects/:id` | Delete project |

## Running Both Servers

You need TWO terminal windows:

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

---

## Troubleshooting

### MongoDB Connection Error

If you see:
```
❌ MongoDB connection error: connect ECONNREFUSED 127.0.0.1:27017
```

**Solution:**
1. Make sure MongoDB is installed
2. Start MongoDB service:
   ```bash
   net start MongoDB
   ```

### Port Already in Use

If port 3001 is taken:
1. Edit `.env` file
2. Change `PORT=3001` to another port like `PORT=3002`
3. Update `API_URL` in `src/services/apiService.ts`

---

## Environment Variables

File: `.env`

```
MONGODB_URI=mongodb://localhost:27017/arduino-lab
PORT=3001
```

---

## Database

**Database Name:** `arduino-lab`  
**Collection:** `projects`

Each project contains:
- name
- description  
- components (array)
- wires (array)
- code (Arduino code)
- createdAt
- updatedAt
