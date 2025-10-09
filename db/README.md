# Database Layer - PostgreSQL Integration

This directory contains PostgreSQL client and migrations that parallel the yazhitite C++ backend schema.

## Database Schema

The middle layer uses the **same PostgreSQL database** as yazhitite, enabling seamless data sharing between:
- **yazhitite** (C++ backend) - Core business logic and event management
- **middle** (Node.js layer) - Authentication and user-facing APIs

### Tables

#### 1. `users` - Base user information
```sql
- id: SERIAL PRIMARY KEY
- username: VARCHAR(50) UNIQUE
- email: VARCHAR(255) UNIQUE
- password_hash: VARCHAR(255)
- salt: VARCHAR(255)
- display_name: VARCHAR(100)
- is_active: BOOLEAN
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
```

#### 2. `accounts` - Extended account data
```sql
- account_id: SERIAL PRIMARY KEY
- user_id: INTEGER (FK to users)
- phone_number: VARCHAR(20) UNIQUE
- first_name, last_name: VARCHAR(50)
- pin_hash: VARCHAR(255)
- photo_base64, id_document_base64: TEXT
- id_document_type, id_verification_status: VARCHAR
- email_verified, phone_verified: BOOLEAN
- balance: DECIMAL(10, 2)
- lifetime_max_bac: DECIMAL(4, 3)
- last_login: TIMESTAMP
```

#### 3. `events` - Event management
```sql
- event_id: SERIAL PRIMARY KEY
- name, description, location: VARCHAR/TEXT
- start_time, end_time: TIMESTAMP
- organizer_id: INTEGER (FK to accounts)
- max_participants, type, status: INTEGER
```

#### 4. `libation_scores` - BAC measurements
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER (FK to users)
- event_id: INTEGER (FK to events)
- bac: DECIMAL(4, 3)
- timestamp: TIMESTAMP
```

#### 5. `event_participants` - Event attendance
```sql
- event_id, account_id: Composite PRIMARY KEY
- joined_at: TIMESTAMP
```

#### 6. `password_reset_tokens` - Password recovery
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER (FK to users)
- token: VARCHAR(255) UNIQUE
- expires_at, created_at: TIMESTAMP
- used: BOOLEAN
```

#### 7. `email_verification_tokens` - Email verification
```sql
- id: SERIAL PRIMARY KEY
- user_id: INTEGER (FK to users)
- token: VARCHAR(255) UNIQUE
- expires_at, created_at: TIMESTAMP
- used: BOOLEAN
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install pg bcrypt
```

### 2. Configure Environment

Create `.env` file with PostgreSQL credentials:

```bash
cp .env.example .env
```

Edit `.env`:
```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=libation_db
POSTGRES_USER=libation
POSTGRES_PASSWORD=changeme
```

### 3. Run Migrations

```bash
npm run db:migrate
```

This creates all tables, indexes, and triggers.

### 4. Verify Connection

Start the server:
```bash
npm run dev
```

Check logs for "PostgreSQL connected successfully"

## Usage

### Query Examples

```javascript
const db = require('./db/postgres');

// Simple query
const result = await db.query(
  'SELECT * FROM users WHERE email = $1',
  [email]
);

// Transaction
await db.transaction(async (client) => {
  await client.query('INSERT INTO users ...');
  await client.query('INSERT INTO accounts ...');
});
```

### In Controllers

```javascript
const db = require('../db/postgres');

// Get user
const user = await db.query(
  'SELECT * FROM users WHERE id = $1',
  [userId]
);

// Create user
const result = await db.query(
  'INSERT INTO users (username, email, password_hash, salt) VALUES ($1, $2, $3, $4) RETURNING *',
  [username, email, hash, salt]
);
```

## Migration Management

### Create New Migration

1. Create file: `db/migrations/002_your_migration_name.sql`
2. Write SQL statements
3. Run: `npm run db:migrate`

Migrations are tracked in `schema_migrations` table and only run once.

### Migration Naming Convention

- `001_create_tables.sql` - Initial schema
- `002_add_column_name.sql` - Add columns
- `003_create_index_name.sql` - Add indexes
- etc.

## Connection Pooling

The PostgreSQL client uses connection pooling:
- **Max connections**: 20
- **Idle timeout**: 30 seconds
- **Connection timeout**: 2 seconds
- **Automatic retry**: On connection errors

## Shared Database with yazhitite

Both services use the **same database**:

```
┌─────────────────────────────────────────┐
│         PostgreSQL Database             │
│          (libation_db)                  │
│                                         │
│  ┌─────────────────────────────────┐   │
│  │ Tables:                         │   │
│  │ - users                         │   │
│  │ - accounts                      │   │
│  │ - events                        │   │
│  │ - libation_scores               │   │
│  │ - event_participants            │   │
│  └─────────────────────────────────┘   │
└─────────────────────────────────────────┘
         ↑                      ↑
         │                      │
    ┌────┴────┐          ┌──────┴──────┐
    │ middle  │          │  yazhitite  │
    │ (Node)  │          │    (C++)    │
    └─────────┘          └─────────────┘
```

### Benefits:
- ✅ Single source of truth
- ✅ Data consistency
- ✅ No data synchronization needed
- ✅ Both services can read/write
- ✅ Shared authentication

### Considerations:
- 🔒 Use transactions for multi-table operations
- ⚡ Add indexes for performance
- 🔄 Handle concurrent access properly
- 📊 Monitor connection pool usage

## Testing

### Test Database Connection

```javascript
const db = require('./db/postgres');

async function test() {
  try {
    const result = await db.query('SELECT NOW()');
    console.log('Connected!', result.rows[0]);
  } catch (error) {
    console.error('Connection failed:', error);
  }
}

test();
```

### Run Sample Queries

```bash
# Connect to database
psql -h localhost -U libation -d libation_db

# List tables
\dt

# Query users
SELECT * FROM users;

# Query accounts
SELECT u.*, a.* 
FROM users u 
LEFT JOIN accounts a ON u.id = a.user_id;
```

## Troubleshooting

### Connection Refused
```bash
# Check if PostgreSQL is running
pg_isready -h localhost -p 5432

# Start PostgreSQL (macOS)
brew services start postgresql

# Start PostgreSQL (Docker)
docker run -d --name postgres \
  -e POSTGRES_DB=libation_db \
  -e POSTGRES_USER=libation \
  -e POSTGRES_PASSWORD=changeme \
  -p 5432:5432 \
  postgres:16-alpine
```

### Migration Errors

```bash
# Drop and recreate database
psql -h localhost -U libation -d postgres
DROP DATABASE libation_db;
CREATE DATABASE libation_db;
\q

# Run migrations again
npm run db:migrate
```

### Permission Errors

```bash
# Grant permissions
psql -h localhost -U postgres
GRANT ALL PRIVILEGES ON DATABASE libation_db TO libation;
```

## Best Practices

1. ✅ **Always use parameterized queries** ($1, $2) to prevent SQL injection
2. ✅ **Use transactions** for multi-table operations
3. ✅ **Handle errors gracefully** with try/catch
4. ✅ **Log queries** in development (already configured)
5. ✅ **Release connections** (handled automatically by pool)
6. ✅ **Use indexes** for frequently queried columns

## Next Steps

1. **Install dependencies**: `npm install pg bcrypt`
2. **Configure .env**: Set PostgreSQL credentials
3. **Run migrations**: `npm run db:migrate`
4. **Start server**: `npm run dev`
5. **Test endpoints**: Use Postman or curl

---

**Status**: ✅ **Production-Ready PostgreSQL Integration**

The middle layer now uses the same database as yazhitite, providing a unified data layer for your application!
