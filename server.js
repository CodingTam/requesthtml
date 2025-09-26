/**
 * Portable SQLite Server - No native modules required
 * Uses your existing requests.db file with built-in Node.js only
 * Compatible with Windows portable Node.js
 */

const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const { spawn } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

console.log('🚀 Starting Portable SQLite Request Management System...');

// Database configuration
const dbPath = path.join(__dirname, 'database', 'requests.db');
let isDbConnected = false;
let sqliteCommand = null;

// Check for SQLite executable - synchronous approach
function findSQLiteExecutable() {
    const possiblePaths = [
        'sqlite3',
        'sqlite3.exe',
        path.join(__dirname, 'sqlite3.exe'),
        path.join(__dirname, 'bin', 'sqlite3.exe'),
        path.join(__dirname, 'bin', 'sqlite3'),
        path.join(process.cwd(), 'sqlite3.exe'),
        path.join(process.cwd(), 'bin', 'sqlite3.exe')
    ];

    for (const sqlitePath of possiblePaths) {
        try {
            // For files, check if they exist
            if (sqlitePath.includes('/') || sqlitePath.includes('\\')) {
                if (fs.existsSync(sqlitePath)) {
                    sqliteCommand = sqlitePath;
                    console.log(`📍 Found SQLite executable: ${sqlitePath}`);
                    return sqlitePath;
                }
            } else {
                // For system commands, use synchronous spawn
                try {
                    const result = require('child_process').spawnSync(sqlitePath, ['--version'], {
                        stdio: 'pipe',
                        timeout: 2000,
                        encoding: 'utf8'
                    });

                    if (result.status === 0 && result.stdout) {
                        sqliteCommand = sqlitePath;
                        console.log(`✅ Found SQLite in PATH: ${sqlitePath}`);
                        return sqlitePath;
                    }
                } catch (error) {
                    // Continue to next path
                }
            }
        } catch (error) {
            // Continue to next path
        }
    }

    console.log('❌ SQLite3 not found in any expected location');
    return null;
}

// Simple SQLite query executor using command line (portable approach)
function executeQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        // Check if SQLite is available
        if (!sqliteCommand) {
            reject(new Error('SQLite executable not found'));
            return;
        }

        // Create temporary SQL file
        const tempSqlFile = path.join(__dirname, `temp_${Date.now()}.sql`);

        // Escape parameters and build query
        let processedSql = sql;
        if (params.length > 0) {
            params.forEach((param, index) => {
                if (typeof param === 'string') {
                    processedSql = processedSql.replace('?', `'${param.replace(/'/g, "''")}'`);
                } else if (param === null || param === undefined) {
                    processedSql = processedSql.replace('?', 'NULL');
                } else {
                    processedSql = processedSql.replace('?', param.toString());
                }
            });
        }

        // Prepare SQL with proper output formatting
        let formattedSql = processedSql;
        if (sql.trim().toUpperCase().startsWith('SELECT')) {
            formattedSql = '.mode list\n.separator |\n' + processedSql;
        }

        // Write SQL to temp file for better compatibility
        fs.writeFileSync(tempSqlFile, formattedSql);

        console.log(`🔍 Executing SQL: ${processedSql.substring(0, 100)}...`);
        console.log(`📋 Using SQLite: ${sqliteCommand}`);

        // Execute using temp file approach (more reliable for Windows)
        const sqlite3Process = spawn(sqliteCommand, [dbPath], {
            stdio: 'pipe',
            shell: process.platform === 'win32'
        });

        // Send the SQL directly to stdin instead of using .read
        sqlite3Process.stdin.write(`${formattedSql};\n.quit\n`);
        sqlite3Process.stdin.end();

        let output = '';
        let errorOutput = '';

        sqlite3Process.stdout.on('data', (data) => {
            output += data.toString();
        });

        sqlite3Process.stderr.on('data', (data) => {
            errorOutput += data.toString();
        });

        // Set a shorter timeout since file-based execution is faster
        const timeoutHandle = setTimeout(() => {
            if (!sqlite3Process.killed) {
                console.log('⚠️ SQLite process timeout, forcing kill');
                sqlite3Process.kill('SIGTERM');
                reject(new Error('SQLite process timeout'));
            }
        }, 5000); // 5 second timeout

        sqlite3Process.on('close', (code) => {
            // Clear timeout since process completed
            clearTimeout(timeoutHandle);

            // Clean up temp file
            try {
                fs.unlinkSync(tempSqlFile);
            } catch (e) {
                // Ignore cleanup errors
            }

            if (code === 0) {
                console.log(`✅ SQLite execution successful`);
                if (output) console.log(`📤 Output: ${output.substring(0, 200)}`);

                // Parse output for SELECT queries
                if (sql.trim().toUpperCase().startsWith('SELECT')) {
                    const rows = output.trim().split('\n')
                        .filter(line => line.trim())
                        .map(line => {
                            // Handle pipe-separated values, accounting for empty fields
                            const values = line.split('|').map(val => val || null);
                            return values;
                        });
                    resolve(rows);
                } else {
                    resolve({ success: true, output });
                }
            } else {
                console.log(`❌ SQLite execution failed with code ${code}`);
                console.log(`📤 Error output: ${errorOutput}`);
                console.log(`🔍 SQL was: ${processedSql}`);
                console.log(`📁 Temp file: ${tempSqlFile}`);
                reject(new Error(`SQL execution failed: ${errorOutput || 'Unknown error'}`));
            }
        });

        sqlite3Process.on('error', (error) => {
            // Clear timeout since process errored
            clearTimeout(timeoutHandle);

            // Clean up temp file
            try {
                fs.unlinkSync(tempSqlFile);
            } catch (e) {
                // Ignore cleanup errors
            }
            console.log('SQLite process error:', error.message);
            reject(new Error(`SQLite not available: ${error.message}`));
        });
    });
}

// Fallback: In-memory data cache (if SQLite command line not available)
let memoryCache = {
    users: [],
    requests: [],
    initialized: false
};

function initializeFallbackData() {
    if (memoryCache.initialized) return;

    console.log('⚠️  Using fallback memory data (SQLite command line not available)');

    memoryCache.users = [
        {
            id: 1,
            name: 'Administrator',
            username: 'admin',
            email: 'admin@system.com',
            password: 'admin123',
            team: 'Administration',
            description: 'System Administrator',
            status: 'approved',
            isAdmin: 1
        },
        {
            id: 2,
            name: 'Alice Johnson',
            username: 'alice.johnson',
            email: 'alice@company.com',
            password: 'password123',
            team: 'Marketing Team',
            description: 'Marketing Specialist',
            status: 'approved',
            isAdmin: 0
        }
    ];

    memoryCache.requests = [
        {
            id: 1,
            request_id: 'REQ20240101001',
            requestor_name: 'Alice Johnson',
            requestor_email: 'alice@company.com',
            cc_email: 'marketing@company.com',
            team_name: 'Marketing Team',
            category_name: 'val1',
            request_dates: '2024-01-15,2024-01-16',
            acct_number: 'ACC001',
            request_name: 'Q1 Marketing Campaign',
            currency: 'USD',
            amount: 15000.00,
            adjustment: 0,
            description: 'Budget for Q1 digital marketing campaign',
            status: 'submitted',
            user_id: 2,
            created_at: new Date().toISOString()
        }
    ];

    memoryCache.initialized = true;
}

async function checkDatabase() {
    console.log('📁 Database path:', dbPath);

    // Create database directory if it doesn't exist
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
        console.log('📁 Creating database directory...');
        fs.mkdirSync(dbDir, { recursive: true });
    }

    if (!fs.existsSync(dbPath)) {
        console.log('❌ Database file not found, initializing...');
        try {
            // Initialize empty database
            initializeDatabase();
            return true;
        } catch (error) {
            console.log('❌ Failed to initialize database:', error.message);
            return false;
        }
    }

    console.log('✅ Database file found');

    // Check if it's a valid SQLite file
    try {
        const header = fs.readFileSync(dbPath, { encoding: null }).subarray(0, 16);
        const expectedHeader = Buffer.from('SQLite format 3\0');

        if (header.equals(expectedHeader)) {
            console.log('✅ Valid SQLite database format detected');

            // Check if tables exist
            if (sqliteCommand) {
                try {
                    await checkAndInitializeTables();
                    isDbConnected = true;
                    console.log('✅ Database tables verified/initialized');
                    return true;
                } catch (error) {
                    console.log('❌ Failed to initialize database tables:', error.message);
                    isDbConnected = false;
                    return false;
                }
            } else {
                console.log('⚠️ SQLite command not available, database connection disabled');
                isDbConnected = false;
                return false;
            }
        } else {
            console.log('⚠️  File exists but may not be a valid SQLite database');
            return false;
        }
    } catch (err) {
        console.log('⚠️  Error reading database file:', err.message);
        return false;
    }
}

function initializeDatabase() {
    console.log('🔧 Initializing new database...');

    if (!sqliteCommand) {
        console.log('⚠️  SQLite not available, skipping database initialization');
        return;
    }

    // Only create empty database file if it doesn't exist
    if (!fs.existsSync(dbPath)) {
        console.log('📁 Creating new database file...');
        fs.writeFileSync(dbPath, '');
    } else {
        console.log('📁 Database file exists, preserving existing data...');
    }

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'setup-database.sql');
    if (fs.existsSync(schemaPath)) {
        try {
            const schema = fs.readFileSync(schemaPath, 'utf8');
            console.log('📋 Executing database schema...');

            // Execute schema synchronously
            const sqliteProcess = spawn(sqliteCommand, [dbPath], {
                stdio: 'pipe',
                shell: process.platform === 'win32'
            });

            sqliteProcess.stdin.write(schema);
            sqliteProcess.stdin.end();

            console.log('✅ Database initialized successfully');
        } catch (error) {
            console.log('❌ Failed to initialize database:', error.message);
        }
    } else {
        console.log('⚠️  Schema file not found, creating basic structure...');
        // Create basic tables if schema file is missing
        createBasicTables();
    }
}

async function checkAndInitializeTables() {
    if (!sqliteCommand) return;

    try {
        console.log('🔍 Checking if required tables exist...');
        const checkTablesQuery = "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'requests');";
        const rows = await executeQuery(checkTablesQuery);
        const tableNames = rows.map(row => row[0].trim());

        console.log('📋 Found tables:', tableNames);
        console.log('🔍 Checking for users table:', tableNames.includes('users'));
        console.log('🔍 Checking for requests table:', tableNames.includes('requests'));

        const hasUsers = tableNames.includes('users');
        const hasRequests = tableNames.includes('requests');

        if (!hasUsers || !hasRequests) {
            console.log('⚠️  Required tables missing, creating missing tables...');
            console.log(`   - users table: ${hasUsers ? '✅' : '❌'}`);
            console.log(`   - requests table: ${hasRequests ? '✅' : '❌'}`);

            // Create only the missing tables instead of reinitializing the entire database
            if (!hasUsers) {
                console.log('🔧 Creating users table...');
                await createUsersTable();
            }
            if (!hasRequests) {
                console.log('🔧 Creating requests table...');
                await createRequestsTable();
            }
            console.log('✅ Missing tables created successfully');
        } else {
            console.log('✅ All required tables exist, checking for schema updates...');
            await checkAndUpdateSchema();
        }
    } catch (error) {
        console.log('⚠️  Could not check tables:', error.message);
        console.log('🔧 Attempting to initialize database...');
        initializeDatabase();
    }
}

async function createUsersTable() {
    const usersTableSQL = `
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            username TEXT UNIQUE NOT NULL,
            email TEXT NOT NULL,
            password TEXT NOT NULL,
            team TEXT NOT NULL,
            description TEXT,
            status TEXT DEFAULT 'active',
            role TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    `;
    await executeQuery(usersTableSQL);
}

async function createRequestsTable() {
    const requestsTableSQL = `
        CREATE TABLE IF NOT EXISTS requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT UNIQUE NOT NULL,
            requester_name TEXT NOT NULL,
            requester_email TEXT NOT NULL,
            requestor_email TEXT NOT NULL,
            requestor_name TEXT NOT NULL,
            validation TEXT NOT NULL,
            time_period TEXT NOT NULL,
            account_name TEXT NOT NULL,
            request_description TEXT NOT NULL,
            currency TEXT NOT NULL DEFAULT 'USD',
            amount DECIMAL(10,2) NOT NULL DEFAULT 0,
            urgency INTEGER DEFAULT 0,
            business_justification TEXT,
            status TEXT DEFAULT 'submitted',
            failed_message TEXT,
            user_id INTEGER,
            app_user_id INTEGER,
            submission_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );
    `;
    await executeQuery(requestsTableSQL);
}

async function checkAndUpdateSchema() {
    try {
        // Check if failed_message column exists in requests table
        const columnQuery = "PRAGMA table_info(requests);";
        const columns = await executeQuery(columnQuery);
        const columnNames = columns.map(row => row[1].trim()); // Column name is at index 1

        if (!columnNames.includes('failed_message')) {
            console.log('🔄 Adding failed_message column to requests table...');
            await executeQuery('ALTER TABLE requests ADD COLUMN failed_message TEXT;');
            console.log('✅ Schema updated successfully');
        } else {
            console.log('✅ Schema is up to date');
        }
    } catch (error) {
        console.log('⚠️  Schema update failed:', error.message);
    }
}

function createBasicTables() {
    const basicSchema = `
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT NOT NULL,
    password TEXT NOT NULL,
    team TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    isAdmin INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    request_id TEXT UNIQUE NOT NULL,
    requestor_name TEXT NOT NULL,
    requestor_email TEXT NOT NULL,
    cc_email TEXT,
    team_name TEXT NOT NULL,
    category_name TEXT NOT NULL,
    request_dates TEXT NOT NULL,
    acct_number TEXT NOT NULL,
    request_name TEXT NOT NULL,
    currency TEXT NOT NULL,
    amount DECIMAL(15,2) NOT NULL,
    adjustment INTEGER NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'submitted',
    user_id INTEGER,
    request_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
    status_update_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

INSERT INTO users (id, name, username, email, password, team, description, status, isAdmin)
VALUES (1, 'Administrator', 'admin', 'admin@system.com', 'admin123', 'Administration', 'System Administrator', 'approved', 1);
`;

    try {
        const sqliteProcess = spawn(sqliteCommand, [dbPath], {
            stdio: 'pipe',
            shell: process.platform === 'win32'
        });

        sqliteProcess.stdin.write(basicSchema);
        sqliteProcess.stdin.end();

        console.log('✅ Basic database structure created');
    } catch (error) {
        console.log('❌ Failed to create basic tables:', error.message);
    }
}

// Input validation utilities
function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

function validateString(str, minLength = 1, maxLength = 255) {
    return typeof str === 'string' && str.length >= minLength && str.length <= maxLength;
}

function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

function generateRequestId() {
    const timestamp = Date.now();
    const uuid = uuidv4().split('-')[0];
    return `REQ${timestamp}${uuid.toUpperCase()}`;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'dashboard.html'));
});

// API Routes with fallback support
app.get('/api/requests', async (req, res) => {
    const username = req.query.username;
    const isAdmin = req.query.isAdmin === 'true';

    console.log('GET /api/requests:', { username, isAdmin });

    try {
        if (isDbConnected && sqliteCommand) {
            // Try SQLite first
            try {
                if (isAdmin) {
                    const rows = await executeQuery('SELECT * FROM requests ORDER BY created_at DESC');
                    res.json({ success: true, data: parseRows(rows, 'requests') });
                } else if (username) {
                    const userRows = await executeQuery('SELECT id FROM users WHERE username = ?', [username]);
                    if (userRows.length > 0) {
                        const userId = userRows[0][0];
                        const requestRows = await executeQuery('SELECT * FROM requests WHERE user_id = ? ORDER BY created_at DESC', [userId]);
                        res.json({ success: true, data: parseRows(requestRows, 'requests') });
                    } else {
                        res.status(404).json({ error: 'User not found' });
                    }
                } else {
                    res.status(400).json({ error: 'Username is required for non-admin users' });
                }
            } catch (sqlError) {
                console.log('SQLite query failed, using fallback:', sqlError.message);
                initializeFallbackData();
                // Use fallback data
                if (isAdmin) {
                    res.json({ success: true, data: memoryCache.requests });
                } else {
                    const userRequests = memoryCache.requests.filter(r => {
                        const user = memoryCache.users.find(u => u.username === username);
                        return user && r.user_id === user.id;
                    });
                    res.json({ success: true, data: userRequests });
                }
            }
        } else {
            // Fallback mode
            initializeFallbackData();
            if (isAdmin) {
                res.json({ success: true, data: memoryCache.requests });
            } else {
                const userRequests = memoryCache.requests.filter(r => {
                    const user = memoryCache.users.find(u => u.username === username);
                    return user && r.user_id === user.id;
                });
                res.json({ success: true, data: userRequests });
            }
        }
    } catch (err) {
        console.error('Error in /api/requests:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Login endpoint
app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body;

    console.log('Login attempt:', { username, password: password ? '[PROVIDED]' : '[MISSING]' });

    try {
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        if (isDbConnected && sqliteCommand) {
            try {
                const rows = await executeQuery('SELECT * FROM users WHERE username = ?', [username]);
                if (rows.length > 0) {
                    const userData = parseUserRow(rows[0]);

                    // Check password first
                    if (userData.password === password) {
                        // Password is correct, now check status
                        if (userData.status === 'approved') {
                            console.log('✅ Login successful for:', username);
                            res.json({
                                success: true,
                                user: {
                                    id: userData.id,
                                    name: userData.name,
                                    username: userData.username,
                                    email: userData.email,
                                    team: userData.team,
                                    isAdmin: userData.isAdmin === 1,
                                    description: userData.description
                                }
                            });
                            return;
                        } else if (userData.status === 'pending') {
                            console.log('⏳ Login blocked - account pending approval:', username);
                            res.status(403).json({ error: 'Your account is pending admin approval. Please wait for approval before logging in.' });
                            return;
                        } else if (userData.status === 'disabled') {
                            console.log('🚫 Login blocked - account disabled:', username);
                            res.status(403).json({ error: 'Your account has been disabled. Please contact an administrator.' });
                            return;
                        }
                    }
                }
            } catch (sqlError) {
                console.log('SQLite query failed, using fallback:', sqlError.message);
                initializeFallbackData();
            }
        }

        // Fallback authentication
        if (!memoryCache.initialized) initializeFallbackData();

        const user = memoryCache.users.find(u => u.username === username);
        if (user && user.password === password) {
            // Password is correct, check status
            if (user.status === 'approved') {
                console.log('✅ Login successful (fallback):', username);
                res.json({
                    success: true,
                    user: {
                        id: user.id,
                        name: user.name,
                        username: user.username,
                        email: user.email,
                        team: user.team,
                        isAdmin: user.isAdmin === 1,
                        description: user.description
                    }
                });
            } else if (user.status === 'pending') {
                console.log('⏳ Login blocked - account pending approval (fallback):', username);
                res.status(403).json({ error: 'Your account is pending admin approval. Please wait for approval before logging in.' });
            } else if (user.status === 'disabled') {
                console.log('🚫 Login blocked - account disabled (fallback):', username);
                res.status(403).json({ error: 'Your account has been disabled. Please contact an administrator.' });
            }
        } else {
            console.log('❌ Invalid credentials for:', username);
            res.status(401).json({ error: 'Invalid username or password' });
        }

    } catch (err) {
        console.error('Error in login:', err);
        res.status(500).json({ error: 'Login error' });
    }
});

// Registration endpoint
app.post('/api/auth/register', async (req, res) => {
    const { name, username, email, password, team, description } = req.body;

    console.log('Registration attempt:', { name, username, email, team });

    try {
        if (!name || !username || !email || !password || !team) {
            return res.status(400).json({ error: 'Name, username, email, password, and team are required' });
        }

        // Basic validation
        if (!validateString(name, 1, 100)) {
            return res.status(400).json({ error: 'Invalid name' });
        }

        if (!validateString(username, 1, 50) || username.includes(' ')) {
            return res.status(400).json({ error: 'Invalid username (no spaces allowed)' });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        if (!validateString(password, 6, 255)) {
            return res.status(400).json({ error: 'Password must be 6-255 characters long' });
        }

        // Check if user already exists and add new user
        if (isDbConnected && sqliteCommand) {
            try {
                // Check existing user in database
                const existingRows = await executeQuery('SELECT username FROM users WHERE username = ?', [username]);
                if (existingRows.length > 0) {
                    return res.status(409).json({ error: 'Username already exists' });
                }

                // Insert new user into database
                const insertQuery = `INSERT INTO users (name, username, email, password, team, description, status, isAdmin, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'), datetime('now'))`;
                await executeQuery(insertQuery, [
                    sanitizeString(name),
                    sanitizeString(username),
                    sanitizeString(email),
                    password,
                    sanitizeString(team),
                    description ? sanitizeString(description) : ''
                ]);

                // Sync database to ensure data is written to disk
                await syncDatabase();

                console.log('✅ User registered in database:', username);
                res.json({
                    success: true,
                    message: 'Registration successful! Your account is pending admin approval.',
                    user: {
                        username: username,
                        email: email,
                        team: team,
                        status: 'pending'
                    }
                });
                return;
            } catch (sqlError) {
                console.log('SQLite insert failed, using fallback:', sqlError.message);
                initializeFallbackData();
            }
        }

        // Fallback registration (add to memory cache)
        if (!memoryCache.initialized) initializeFallbackData();

        // Check if user already exists in memory
        const existingUser = memoryCache.users.find(u => u.username === username);
        if (existingUser) {
            return res.status(409).json({ error: 'Username already exists' });
        }

        // Add to memory cache
        const newId = Math.max(0, ...memoryCache.users.map(u => u.id)) + 1;
        const newUser = {
            id: newId,
            name: sanitizeString(name),
            username: sanitizeString(username),
            email: sanitizeString(email),
            password: password,
            team: sanitizeString(team),
            description: description ? sanitizeString(description) : '',
            status: 'pending',
            isAdmin: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };

        memoryCache.users.push(newUser);

        console.log('✅ User registered (fallback):', username);
        res.json({
            success: true,
            message: 'Registration successful! Your account is pending admin approval.',
            user: {
                username: username,
                email: email,
                team: team,
                status: 'pending'
            }
        });

    } catch (err) {
        console.error('Error in registration:', err);
        res.status(500).json({ error: 'Registration error' });
    }
});

// Create new request endpoint
app.post('/api/requests', async (req, res) => {
    console.log('POST /api/requests:', req.body);

    try {
        const {
            requestorName, requestorEmail, ccEmail, teamName, categoryName,
            requestDates, acctNumber, requestName, currency, amount, adjustment, description, userId
        } = req.body;

        // Validation
        if (!requestorName || !requestorEmail || !teamName || !categoryName ||
            !requestDates || !acctNumber || !requestName || !currency || !amount || adjustment === undefined) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        if (!validateString(requestorName, 1, 100)) {
            return res.status(400).json({ error: 'Invalid requestor name' });
        }

        if (!validateEmail(requestorEmail)) {
            return res.status(400).json({ error: 'Invalid email format' });
        }

        const requestId = generateRequestId();

        // Try to add to database first
        if (isDbConnected && sqliteCommand) {
            try {
                // Use provided userId or default to 2 if not provided
                const finalUserId = userId ? parseInt(userId) : 2;

                const insertQuery = `INSERT INTO requests (request_id, requestor_name, requestor_email, cc_email, team_name, category_name, request_dates, acct_number, request_name, currency, amount, adjustment, description, status, user_id, request_datetime, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, datetime('now'), datetime('now'))`;

                await executeQuery(insertQuery, [
                    requestId,
                    sanitizeString(requestorName),
                    sanitizeString(requestorEmail),
                    ccEmail ? sanitizeString(ccEmail) : null,
                    sanitizeString(teamName),
                    sanitizeString(categoryName),
                    sanitizeString(requestDates),
                    sanitizeString(acctNumber),
                    sanitizeString(requestName),
                    sanitizeString(currency),
                    parseFloat(amount),
                    parseInt(adjustment),
                    description ? sanitizeString(description) : null,
                    finalUserId
                ]);

                // Log initial status to history
                await logStatusHistory(requestId, null, 'submitted', sanitizeString(requestorName), 'Initial request submission');

                // Sync database to ensure data is written to disk
                await syncDatabase();

                console.log('✅ Request created in database:', requestId);
                res.status(201).json({
                    success: true,
                    message: 'Request created successfully',
                    requestId: requestId
                });
                return;
            } catch (sqlError) {
                console.log('SQLite insert failed, using fallback:', sqlError.message);
                initializeFallbackData();
            }
        }

        // Fallback - add to memory cache
        if (!memoryCache.initialized) initializeFallbackData();

        const newId = Math.max(0, ...memoryCache.requests.map(r => r.id)) + 1;
        const finalUserId = userId ? parseInt(userId) : 2;

        const newRequest = {
            id: newId,
            request_id: requestId,
            requestor_name: sanitizeString(requestorName),
            requestor_email: sanitizeString(requestorEmail),
            cc_email: ccEmail ? sanitizeString(ccEmail) : null,
            team_name: sanitizeString(teamName),
            category_name: sanitizeString(categoryName),
            request_dates: sanitizeString(requestDates),
            acct_number: sanitizeString(acctNumber),
            request_name: sanitizeString(requestName),
            currency: sanitizeString(currency),
            amount: parseFloat(amount),
            adjustment: parseInt(adjustment),
            description: description ? sanitizeString(description) : null,
            status: 'submitted',
            user_id: finalUserId,
            request_datetime: new Date().toISOString(),
            created_at: new Date().toISOString()
        };

        memoryCache.requests.push(newRequest);

        console.log('✅ Request created (fallback):', requestId);
        res.status(201).json({
            success: true,
            message: 'Request created successfully',
            requestId: requestId
        });

    } catch (err) {
        console.error('Error creating request:', err);
        res.status(500).json({ error: 'Failed to create request' });
    }
});

// Admin: Get all users
app.get('/api/admin/users', async (req, res) => {
    try {
        if (isDbConnected && sqliteCommand) {
            try {
                const rows = await executeQuery('SELECT id, username, email, team, description, status, isAdmin, created_at FROM users ORDER BY created_at DESC');
                const users = rows.map(row => ({
                    id: parseInt(row[0]),
                    username: row[1],
                    email: row[2],
                    team: row[3],
                    description: row[4],
                    status: row[5],
                    isAdmin: parseInt(row[6]),
                    created_at: row[7]
                }));
                res.json({ success: true, users: users });
                return;
            } catch (sqlError) {
                console.log('SQLite query failed, using fallback:', sqlError.message);
                initializeFallbackData();
            }
        }

        // Fallback
        if (!memoryCache.initialized) initializeFallbackData();
        const users = memoryCache.users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            team: u.team,
            description: u.description,
            status: u.status,
            isAdmin: u.isAdmin,
            created_at: u.created_at
        }));

        res.json({ success: true, users: users });
    } catch (err) {
        console.error('Error getting users:', err);
        res.status(500).json({ error: 'Failed to get users' });
    }
});

// Admin: Update user status
app.put('/api/admin/users/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    console.log('Updating user status:', { id, status });

    try {
        if (!['pending', 'approved', 'disabled'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        if (isDbConnected && sqliteCommand) {
            try {
                await executeQuery('UPDATE users SET status = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
                console.log(`✅ User ${id} status updated to ${status} in database`);
                res.json({ success: true, message: `User status updated to ${status}` });
                return;
            } catch (sqlError) {
                console.log('SQLite update failed, using fallback:', sqlError.message);
                initializeFallbackData();
            }
        }

        // Fallback
        if (!memoryCache.initialized) initializeFallbackData();
        const userIndex = memoryCache.users.findIndex(u => u.id == id);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        memoryCache.users[userIndex].status = status;
        memoryCache.users[userIndex].updated_at = new Date().toISOString();

        console.log(`✅ User ${id} status updated to ${status} (fallback)`);
        res.json({ success: true, message: `User status updated to ${status}` });

    } catch (err) {
        console.error('Error updating user status:', err);
        res.status(500).json({ error: 'Failed to update user status' });
    }
});

// New endpoint for admin request status override
app.put('/api/admin/requests/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, admin_comments } = req.body;

    if (!status) {
        res.status(400).json({ error: 'Status is required' });
        return;
    }

    const validStatuses = ['submitted', 'processing', 'failed', 'completed'];
    if (!validStatuses.includes(status.toLowerCase())) {
        res.status(400).json({ error: 'Invalid status. Must be one of: submitted, processing, failed, completed' });
        return;
    }

    try {
        if (isDbConnected && sqliteCommand) {
            try {
                let query = 'UPDATE requests SET status = ?, updated_at = datetime(\'now\')';
                let params = [status];

                // Add admin comments if provided
                if (admin_comments) {
                    query += ', admin_comments = ?';
                    params.push(admin_comments);
                }

                query += ' WHERE id = ?';
                params.push(id);

                await executeQuery(query, params);
                console.log(`✅ Request ${id} status updated to ${status}`);
                res.json({
                    success: true,
                    message: `Request status updated to ${status}`,
                    admin_comments: admin_comments || null
                });
            } catch (sqlError) {
                console.log('SQLite update failed, using fallback:', sqlError.message);
                res.status(500).json({ error: 'Failed to update request status' });
            }
        } else {
            // Use fallback data
            if (!memoryCache.initialized) initializeFallbackData();
            const requestIndex = memoryCache.requests.findIndex(r => r.id == id);

            if (requestIndex === -1) {
                res.status(404).json({ error: 'Request not found' });
                return;
            }

            memoryCache.requests[requestIndex].status = status;
            memoryCache.requests[requestIndex].updated_at = new Date().toISOString();

            if (admin_comments) {
                memoryCache.requests[requestIndex].admin_comments = admin_comments;
            }

            console.log(`✅ Request ${id} status updated to ${status} (fallback)`);
            res.json({
                success: true,
                message: `Request status updated to ${status}`,
                admin_comments: admin_comments || null
            });
        }
    } catch (error) {
        console.log('❌ Error updating request status:', error.message);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});

// Helper function to sync database (force write to disk)
async function syncDatabase() {
    if (!sqliteCommand || !isDbConnected) return;

    try {
        // Simple sync using VACUUM - forces data to be written
        await executeQuery('PRAGMA synchronous = FULL');
        console.log('💾 Database sync enabled');
    } catch (error) {
        console.log('⚠️ Database sync warning:', error.message);
    }
}

// Helper function to log status changes to history table
async function logStatusHistory(requestId, oldStatus, newStatus, changedBy, notes = null) {
    const historyQuery = `INSERT INTO request_status_history (request_id, old_status, new_status, changed_by, change_datetime, notes) VALUES (?, ?, ?, ?, datetime('now'), ?)`;

    try {
        if (isDbConnected && sqliteCommand) {
            await executeQuery(historyQuery, [requestId, oldStatus, newStatus, changedBy, notes]);
            console.log(`📝 Status history logged: ${requestId} ${oldStatus} -> ${newStatus} by ${changedBy}`);
        }
    } catch (error) {
        console.error('Failed to log status history:', error.message);
    }
}

// Admin: Update request status
app.put('/api/admin/requests/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status, changedBy, notes } = req.body;

    console.log('Updating request status:', { id, status, changedBy });

    try {
        if (!['submitted', 'processing', 'completed', 'rejected'].includes(status)) {
            return res.status(400).json({ error: 'Invalid status' });
        }

        if (!changedBy) {
            return res.status(400).json({ error: 'changedBy field is required' });
        }

        if (isDbConnected && sqliteCommand) {
            try {
                // Get current status first
                const currentRows = await executeQuery('SELECT request_id, status FROM requests WHERE id = ?', [id]);
                if (currentRows.length === 0) {
                    return res.status(404).json({ error: 'Request not found' });
                }

                const currentRequest = {
                    request_id: currentRows[0][0],
                    status: currentRows[0][1]
                };

                // Update the request status
                await executeQuery('UPDATE requests SET status = ?, status_update_datetime = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [status, id]);

                // Log to status history
                await logStatusHistory(currentRequest.request_id, currentRequest.status, status, changedBy, notes);

                // Sync database to ensure data is written to disk
                await syncDatabase();

                console.log(`✅ Request ${id} status updated to ${status} in database`);
                res.json({ success: true, message: `Request status updated to ${status}` });
                return;
            } catch (sqlError) {
                console.log('SQLite update failed, using fallback:', sqlError.message);
                // Could implement fallback here if needed
            }
        }

        // Fallback mode
        if (!memoryCache.initialized) initializeFallbackData();
        const requestIndex = memoryCache.requests.findIndex(r => r.id == id);
        if (requestIndex === -1) {
            return res.status(404).json({ error: 'Request not found' });
        }

        const oldStatus = memoryCache.requests[requestIndex].status;
        memoryCache.requests[requestIndex].status = status;
        memoryCache.requests[requestIndex].updated_at = new Date().toISOString();

        console.log(`✅ Request ${id} status updated to ${status} (fallback)`);
        res.json({ success: true, message: `Request status updated to ${status}` });

    } catch (err) {
        console.error('Error updating request status:', err);
        res.status(500).json({ error: 'Failed to update request status' });
    }
});

// Admin: Get analytics data
app.get('/api/admin/analytics', async (req, res) => {
    try {
        if (isDbConnected && sqliteCommand) {
            try {
                // Get users overview
                const userStats = await executeQuery('SELECT COUNT(*) as total, COUNT(CASE WHEN datetime(created_at) >= datetime("now", "-1 day") THEN 1 END) as daily_active FROM users');

                // Get requests overview
                const requestStats = await executeQuery(`
                    SELECT
                        COUNT(*) as total,
                        COUNT(CASE WHEN date(created_at) = date('now') THEN 1 END) as today,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                    FROM requests
                `);

                // Get status changes
                const statusChanges = await executeQuery(`
                    SELECT
                        COUNT(*) as total_changes,
                        COUNT(CASE WHEN date(created_at) >= date('now', '-1 day') THEN 1 END) as last_24h
                    FROM requests
                    WHERE updated_at != created_at
                `);

                // Get users breakdown by team
                const usersBreakdown = await executeQuery(`
                    SELECT
                        u.team,
                        COUNT(u.id) as user_count,
                        COUNT(r.id) as request_count,
                        COUNT(CASE WHEN u.status = 'approved' THEN 1 END) as active_users
                    FROM users u
                    LEFT JOIN requests r ON u.id = r.user_id
                    GROUP BY u.team
                    ORDER BY user_count DESC
                `);

                // Get requests breakdown by status
                const requestsBreakdown = await executeQuery(`
                    SELECT
                        status,
                        COUNT(*) as count,
                        ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM requests), 1) as percentage,
                        AVG(JULIANDAY('now') - JULIANDAY(created_at)) as avg_days
                    FROM requests
                    GROUP BY status
                    ORDER BY count DESC
                `);

                const analytics = {
                    users: {
                        total: userStats[0][0] || 0,
                        daily_active: userStats[0][1] || 0
                    },
                    requests: {
                        total: requestStats[0][0] || 0,
                        today: requestStats[0][1] || 0,
                        completed_percentage: requestStats[0][0] > 0 ? Math.round((requestStats[0][2] / requestStats[0][0]) * 100) : 0,
                        failed_percentage: requestStats[0][0] > 0 ? Math.round((requestStats[0][3] / requestStats[0][0]) * 100) : 0
                    },
                    status_changes: {
                        total: statusChanges[0][0] || 0,
                        last_24h: statusChanges[0][1] || 0
                    },
                    usersBreakdown: usersBreakdown.map(row => ({
                        team: row[0],
                        userCount: row[1],
                        requestCount: row[2],
                        activeUsers: row[3]
                    })),
                    requestsBreakdown: requestsBreakdown.map(row => ({
                        status: row[0],
                        count: row[1],
                        percentage: row[2],
                        avgDays: Math.round(row[3] || 0)
                    }))
                };

                res.json(analytics);
                return;
            } catch (sqlError) {
                console.log('SQLite query failed:', sqlError.message);
            }
        }

        // Fallback mode
        if (!memoryCache.initialized) initializeFallbackData();

        const analytics = {
            users: {
                total: memoryCache.users.length,
                daily_active: memoryCache.users.filter(u =>
                    new Date(u.created_at) >= new Date(Date.now() - 24*60*60*1000)
                ).length
            },
            requests: {
                total: memoryCache.requests.length,
                today: memoryCache.requests.filter(r =>
                    new Date(r.created_at).toDateString() === new Date().toDateString()
                ).length,
                completed_percentage: memoryCache.requests.length > 0 ?
                    Math.round((memoryCache.requests.filter(r => r.status === 'completed').length / memoryCache.requests.length) * 100) : 0,
                failed_percentage: memoryCache.requests.length > 0 ?
                    Math.round((memoryCache.requests.filter(r => r.status === 'failed').length / memoryCache.requests.length) * 100) : 0
            },
            status_changes: {
                total: 0,
                last_24h: 0
            }
        };

        res.json(analytics);
    } catch (err) {
        console.error('Error getting analytics:', err);
        res.status(500).json({ error: 'Failed to get analytics data' });
    }
});

// Admin: Get status history
app.get('/api/admin/status-history', async (req, res) => {
    try {
        if (isDbConnected && sqliteCommand) {
            try {
                const rows = await executeQuery(`
                    SELECT
                        status,
                        COUNT(*) as count,
                        MAX(updated_at) as last_change
                    FROM requests
                    GROUP BY status
                    ORDER BY count DESC
                `);

                const statusHistory = rows.map(row => ({
                    status: row[0],
                    count: row[1],
                    lastChange: row[2]
                }));

                res.json(statusHistory);
                return;
            } catch (sqlError) {
                console.log('SQLite query failed:', sqlError.message);
            }
        }

        // Fallback mode
        if (!memoryCache.initialized) initializeFallbackData();

        const statusCounts = {};
        memoryCache.requests.forEach(request => {
            statusCounts[request.status] = (statusCounts[request.status] || 0) + 1;
        });

        const statusHistory = Object.entries(statusCounts).map(([status, count]) => ({
            status,
            count,
            lastChange: new Date().toISOString()
        }));

        res.json(statusHistory);
    } catch (err) {
        console.error('Error getting status history:', err);
        res.status(500).json({ error: 'Failed to get status history' });
    }
});

// Admin: Get recent activity
app.get('/api/admin/recent-activity', async (req, res) => {
    try {
        if (isDbConnected && sqliteCommand) {
            try {
                const rows = await executeQuery(`
                    SELECT
                        r.request_name as title,
                        r.status,
                        r.team_name as team,
                        u.username as requester,
                        r.updated_at,
                        r.created_at
                    FROM requests r
                    LEFT JOIN users u ON r.user_id = u.id
                    ORDER BY r.updated_at DESC
                    LIMIT 10
                `);

                const recentActivity = rows.map(row => ({
                    title: row[0],
                    status: row[1],
                    team: row[2],
                    requester: row[3] || 'Unknown',
                    updated_at: row[4],
                    created_at: row[5]
                }));

                res.json(recentActivity);
                return;
            } catch (sqlError) {
                console.log('SQLite query failed:', sqlError.message);
            }
        }

        // Fallback mode
        if (!memoryCache.initialized) initializeFallbackData();

        const recentActivity = memoryCache.requests
            .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))
            .slice(0, 10)
            .map(request => ({
                title: request.title,
                status: request.status,
                team: request.team,
                requester: request.requester,
                updated_at: request.updated_at,
                created_at: request.created_at
            }));

        res.json(recentActivity);
    } catch (err) {
        console.error('Error getting recent activity:', err);
        res.status(500).json({ error: 'Failed to get recent activity' });
    }
});

// Admin: Get trends data
app.get('/api/admin/trends', async (req, res) => {
    try {
        const period = req.query.period || 'monthly'; // 'daily' or 'monthly'

        if (isDbConnected && sqliteCommand) {
            try {
                let query;
                let dateFormat;
                let timeRange;
                let labelField;

                if (period === 'daily') {
                    dateFormat = '%Y-%m-%d';
                    timeRange = '-30 days';
                    labelField = 'day';
                } else {
                    dateFormat = '%Y-%m';
                    timeRange = '-6 months';
                    labelField = 'month';
                }

                query = `
                    SELECT
                        strftime('${dateFormat}', created_at) as period,
                        COUNT(*) as total_requests,
                        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
                        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed
                    FROM requests
                    WHERE created_at >= date('now', '${timeRange}')
                    GROUP BY strftime('${dateFormat}', created_at)
                    ORDER BY period
                `;

                const rows = await executeQuery(query);

                const trends = rows.map(row => ({
                    [labelField]: row[0],
                    total_requests: row[1],
                    completed: row[2],
                    failed: row[3],
                    success_rate: row[1] > 0 ? Math.round((row[2] / row[1]) * 100) : 0
                }));

                res.json(trends);
                return;
            } catch (sqlError) {
                console.log('SQLite query failed:', sqlError.message);
            }
        }

        // Fallback mode
        if (!memoryCache.initialized) initializeFallbackData();

        // Simple trends calculation for fallback
        const currentMonth = new Date().toISOString().slice(0, 7);
        const trends = [{
            month: currentMonth,
            total_requests: memoryCache.requests.length,
            completed: memoryCache.requests.filter(r => r.status === 'completed').length,
            failed: memoryCache.requests.filter(r => r.status === 'failed').length,
            success_rate: memoryCache.requests.length > 0 ?
                Math.round((memoryCache.requests.filter(r => r.status === 'completed').length / memoryCache.requests.length) * 100) : 0
        }];

        res.json(trends);
    } catch (err) {
        console.error('Error getting trends:', err);
        res.status(500).json({ error: 'Failed to get trends data' });
    }
});

// Get request status history
app.get('/api/requests/:id/history', async (req, res) => {
    const { id } = req.params;

    try {
        if (isDbConnected && sqliteCommand) {
            try {
                // Get request_id first
                const requestRows = await executeQuery('SELECT request_id FROM requests WHERE id = ?', [id]);
                if (requestRows.length === 0) {
                    return res.status(404).json({ error: 'Request not found' });
                }

                const requestId = requestRows[0][0];

                // Get history
                const historyRows = await executeQuery('SELECT * FROM request_status_history WHERE request_id = ? ORDER BY change_datetime DESC', [requestId]);
                const history = historyRows.map(row => ({
                    id: parseInt(row[0]),
                    request_id: row[1],
                    old_status: row[2],
                    new_status: row[3],
                    changed_by: row[4],
                    change_datetime: row[5],
                    notes: row[6]
                }));

                res.json({ success: true, data: history });
                return;
            } catch (sqlError) {
                console.log('SQLite query failed:', sqlError.message);
            }
        }

        // Fallback - no history available in memory mode
        res.json({ success: true, data: [], message: 'Status history not available in fallback mode' });

    } catch (err) {
        console.error('Error getting request history:', err);
        res.status(500).json({ error: 'Failed to get request history' });
    }
});

// Helper function to parse SQLite rows
function parseRows(rows, type) {
    if (!rows || rows.length === 0) return [];

    if (type === 'requests') {
        return rows.map(row => ({
            id: parseInt(row[0]),
            request_id: row[1],
            requestor_name: row[2],
            requestor_email: row[3],
            cc_email: row[4],
            team_name: row[5],
            category_name: row[6],
            request_dates: row[7],
            acct_number: row[8],
            request_name: row[9],
            currency: row[10],
            amount: parseFloat(row[11]),
            adjustment: parseInt(row[12]),
            description: row[13],
            status: row[14],
            user_id: parseInt(row[15]),
            request_datetime: row[16],
            status_update_datetime: row[17],
            created_at: row[18],
            updated_at: row[19],
            failed_message: row[20],
            admin_comments: row[21]
        }));
    }

    return rows;
}

function parseUserRow(row) {
    return {
        id: parseInt(row[0]),
        name: row[1],
        username: row[2],
        email: row[3],
        password: row[4],
        team: row[5],
        description: row[6],
        status: row[7],
        isAdmin: parseInt(row[8])
    };
}

// Health check
app.get('/api/health', (req, res) => {
    const dbStatus = isDbConnected ? 'SQLite Connected' : 'Fallback Mode';
    const userCount = memoryCache.initialized ? memoryCache.users.length : 'Unknown';
    const requestCount = memoryCache.initialized ? memoryCache.requests.length : 'Unknown';

    res.json({
        success: true,
        message: 'Server is running',
        database: dbStatus,
        dbPath: dbPath,
        users: userCount,
        requests: requestCount,
        timestamp: new Date().toISOString()
    });
});

// Statistics endpoint
app.get('/api/statistics', (req, res) => {
    try {
        // Use fallback data for statistics
        if (!memoryCache.initialized) initializeFallbackData();

        const stats = {
            total: memoryCache.requests.length,
            submitted: memoryCache.requests.filter(r => r.status === 'submitted').length,
            processing: memoryCache.requests.filter(r => r.status === 'processing').length,
            completed: memoryCache.requests.filter(r => r.status === 'completed').length
        };

        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('Error getting statistics:', err);
        res.status(500).json({ error: 'Failed to get statistics' });
    }
});

// Error handling
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

// Initialize and start server
console.log('🔧 Checking database connection...');

// Try to find SQLite executable first
console.log('🔍 Looking for SQLite executable...');
sqliteCommand = 'sqlite3';  // Default to system sqlite3 on macOS/Linux
findSQLiteExecutable();

// Initialize database check
(async () => {
    const dbExists = await checkDatabase();

    // Start server after database is ready
    server = app.listen(PORT, () => {
        console.log('\n🎉 PORTABLE SQLITE SERVER READY!');
        console.log(`📍 URL: http://localhost:${PORT}`);
        console.log(`🗄️  Database: ${dbPath}`);

        if (isDbConnected && sqliteCommand) {
            console.log('✅ Using SQLite database (with fallback support)');
            console.log(`📋 SQLite executable: ${sqliteCommand}`);
        } else if (isDbConnected && !sqliteCommand) {
            console.log('⚠️  Database file found but SQLite executable not available');
            console.log('⚠️  Using fallback mode (memory-based data)');
        } else {
            console.log('⚠️  Using fallback mode (memory-based data)');
        }

        console.log('\n🔐 Login Credentials:');
        console.log('   Admin: admin / admin123');
        console.log('   User:  alice.johnson / password123');
        console.log('\n✅ Compatible with Windows portable Node.js!');
        console.log('🛡️  No native modules required!');
        console.log('\n💡 Press Ctrl+C to safely shutdown the server');

        // Auto-open login page in default browser
        setTimeout(() => {
            const loginUrl = `http://localhost:${PORT}/login.html`;
            console.log(`\n🚀 Opening login page: ${loginUrl}`);

            const { spawn } = require('child_process');
            let cmd;
            let args;

            if (process.platform === 'win32') {
                cmd = 'cmd';
                args = ['/c', 'start', loginUrl];
            } else if (process.platform === 'darwin') {
                cmd = 'open';
                args = [loginUrl];
            } else {
                cmd = 'xdg-open';
                args = [loginUrl];
            }

            try {
                spawn(cmd, args, { detached: true, stdio: 'ignore' }).unref();
            } catch (error) {
                console.log('⚠️  Could not auto-open browser. Please manually navigate to:', loginUrl);
            }
        }, 1000);
    });
})();

// Graceful shutdown handling
let server;

function gracefulShutdown(signal) {
    console.log(`\n⚠️  Received ${signal}. Shutting down gracefully...`);

    if (server) {
        server.close(() => {
            console.log('✅ Server closed successfully');
            process.exit(0);
        });

        // Force exit after 10 seconds
        setTimeout(() => {
            console.log('⚠️  Forcing shutdown...');
            process.exit(1);
        }, 10000);
    } else {
        process.exit(0);
    }
}

// Handle process signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));