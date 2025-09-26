const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Ensure database directory exists
const dbDir = path.join(__dirname, '..', 'database');
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'requests.db');

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        initializeDatabase();
    }
});

function initializeDatabase() {
    console.log('Initializing database tables...');

    // Users table
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            team TEXT,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating users table:', err.message);
        } else {
            console.log('✓ Users table created/verified');
        }
    });

    // Requests table
    db.run(`
        CREATE TABLE IF NOT EXISTS requests (
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
            request_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
            status_update_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `, (err) => {
        if (err) {
            console.error('Error creating requests table:', err.message);
        } else {
            console.log('✓ Requests table created/verified');
        }
    });

    // Request status history table
    db.run(`
        CREATE TABLE IF NOT EXISTS request_status_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            request_id TEXT NOT NULL,
            old_status TEXT,
            new_status TEXT NOT NULL,
            changed_by TEXT,
            change_datetime DATETIME DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (request_id) REFERENCES requests (request_id)
        )
    `, (err) => {
        if (err) {
            console.error('Error creating request_status_history table:', err.message);
        } else {
            console.log('✓ Request status history table created/verified');
        }
    });

    // Insert sample data for testing
    insertSampleData();
}

function insertSampleData() {
    console.log('Inserting sample data...');

    // Sample user
    db.run(`
        INSERT OR IGNORE INTO users (username, team, description)
        VALUES ('admin', 'Development Team', 'This is a description for admin user')
    `, (err) => {
        if (err && !err.message.includes('UNIQUE constraint')) {
            console.error('Error inserting sample user:', err.message);
        } else {
            console.log('✓ Sample user data inserted/verified');
        }
    });

    // Sample requests
    const sampleRequests = [
        {
            request_id: 'REQ20240101001',
            requestor_name: 'John Doe',
            requestor_email: 'john.doe@example.com',
            cc_email: 'manager@example.com',
            team_name: 'Development Team',
            category_name: 'val1',
            request_dates: '2024-01-15,2024-01-16',
            acct_number: 'ACC001',
            request_name: 'Development Environment Setup',
            currency: 'USD',
            amount: 5000.00,
            adjustment: 0,
            description: 'Setting up development environment for new project',
            status: 'completed'
        },
        {
            request_id: 'REQ20240101002',
            requestor_name: 'Jane Smith',
            requestor_email: 'jane.smith@example.com',
            cc_email: 'hr@example.com',
            team_name: 'HR Team',
            category_name: 'val2',
            request_dates: '2024-01-20',
            acct_number: 'ACC002',
            request_name: 'Training Budget Request',
            currency: 'EUR',
            amount: 2500.50,
            adjustment: 1,
            description: 'Budget allocation for employee training programs',
            status: 'processing'
        },
        {
            request_id: 'REQ20240101003',
            requestor_name: 'Mike Johnson',
            requestor_email: 'mike.johnson@example.com',
            cc_email: '',
            team_name: 'Marketing Team',
            category_name: 'val1',
            request_dates: '2024-01-25,2024-01-26,2024-01-27',
            acct_number: 'ACC003',
            request_name: 'Marketing Campaign Budget',
            currency: 'GBP',
            amount: 10000.00,
            adjustment: 2,
            description: 'Budget for Q1 marketing campaign',
            status: 'submitted'
        }
    ];

    sampleRequests.forEach((request, index) => {
        const query = `
            INSERT OR IGNORE INTO requests (
                request_id, requestor_name, requestor_email, cc_email, team_name,
                category_name, request_dates, acct_number, request_name,
                currency, amount, adjustment, description, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        const params = [
            request.request_id, request.requestor_name, request.requestor_email,
            request.cc_email, request.team_name, request.category_name,
            request.request_dates, request.acct_number, request.request_name,
            request.currency, request.amount, request.adjustment, request.description, request.status
        ];

        db.run(query, params, function(err) {
            if (err && !err.message.includes('UNIQUE constraint')) {
                console.error(`Error inserting sample request ${index + 1}:`, err.message);
            } else {
                console.log(`✓ Sample request ${index + 1} inserted/verified`);

                // Add status history
                const historyQuery = `
                    INSERT OR IGNORE INTO request_status_history (request_id, new_status, changed_by)
                    VALUES (?, ?, ?)
                `;

                db.run(historyQuery, [request.request_id, request.status, request.requestor_name], (historyErr) => {
                    if (historyErr && !historyErr.message.includes('UNIQUE')) {
                        console.error('Error inserting status history:', historyErr.message);
                    }
                });
            }
        });
    });

    // Close database connection after all operations
    setTimeout(() => {
        db.close((err) => {
            if (err) {
                console.error('Error closing database:', err.message);
            } else {
                console.log('\n✓ Database initialization completed successfully!');
                console.log('Database file:', dbPath);
                console.log('\nYou can now start the server with: npm start');
            }
        });
    }, 1000);
}

// Handle process termination
process.on('SIGINT', () => {
    db.close(() => {
        console.log('\nDatabase connection closed.');
        process.exit(0);
    });
});