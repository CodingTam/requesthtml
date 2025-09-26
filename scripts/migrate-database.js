const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, '..', 'database', 'requests.db');

// Connect to database
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error opening database:', err.message);
        process.exit(1);
    } else {
        console.log('Connected to SQLite database');
        migrateDatabase();
    }
});

function migrateDatabase() {
    console.log('Migrating database schema...');

    // Add description column to users table
    db.run(`ALTER TABLE users ADD COLUMN description TEXT`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('✓ Description column already exists in users table');
            } else {
                console.error('Error adding description column to users:', err.message);
            }
        } else {
            console.log('✓ Added description column to users table');
        }
    });

    // Add adjustment column to requests table
    db.run(`ALTER TABLE requests ADD COLUMN adjustment INTEGER DEFAULT 0`, (err) => {
        if (err) {
            if (err.message.includes('duplicate column name')) {
                console.log('✓ Adjustment column already exists in requests table');
            } else {
                console.error('Error adding adjustment column to requests:', err.message);
            }
        } else {
            console.log('✓ Added adjustment column to requests table');
        }

        // Update sample data after migration
        setTimeout(() => {
            updateSampleData();
        }, 1000);
    });
}

function updateSampleData() {
    console.log('Updating sample data...');

    // Update admin user
    db.run(`
        UPDATE users
        SET description = 'This is a description for admin user'
        WHERE username = 'admin'
    `, (err) => {
        if (err) {
            console.error('Error updating admin user:', err.message);
        } else {
            console.log('✓ Updated admin user description');
        }
    });

    // Update sample requests with adjustment values
    const updates = [
        { id: 'REQ20240101001', adjustment: 0 },
        { id: 'REQ20240101002', adjustment: 1 },
        { id: 'REQ20240101003', adjustment: 2 }
    ];

    updates.forEach((update, index) => {
        db.run(`
            UPDATE requests
            SET adjustment = ?
            WHERE request_id = ?
        `, [update.adjustment, update.id], (err) => {
            if (err) {
                console.error(`Error updating request ${update.id}:`, err.message);
            } else {
                console.log(`✓ Updated request ${update.id} with adjustment ${update.adjustment}`);
            }

            // Close database after last update
            if (index === updates.length - 1) {
                setTimeout(() => {
                    db.close((err) => {
                        if (err) {
                            console.error('Error closing database:', err.message);
                        } else {
                            console.log('\n✓ Database migration completed successfully!');
                            console.log('You can now start the server with: npm start');
                        }
                    });
                }, 500);
            }
        });
    });
}

// Handle process termination
process.on('SIGINT', () => {
    db.close(() => {
        console.log('\nDatabase connection closed.');
        process.exit(0);
    });
});