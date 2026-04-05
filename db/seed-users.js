const db = require('./index');
const bcrypt = require('bcrypt');

function normalizeString(value) {
  if (value === undefined || value === null) return undefined;
  return String(value).trim();
}

function requireCredential(name, value, { minLength = 1 } = {}) {
  if (typeof value === 'string' && value.length >= minLength) return;
  const suffix = minLength > 1 ? ` (min ${minLength} chars)` : '';
  console.error(`❌ Missing/invalid ${name}. Set it in .env${suffix}.`);
  process.exit(1);
}

async function upsertUser({ username, password, role }) {
  const saltRounds = 10;
  const hash = await bcrypt.hash(password, saltRounds);
  const res = await db.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username) DO UPDATE
     -- Reset any active session lock when reseeding credentials/role.
     SET password_hash = $2, role = $3, is_active = TRUE, active_session_id = NULL, active_session_expires_at = NULL
     RETURNING id, username, role;`,
    [username, hash, role]
  );
  return res.rows[0];
}

async function seed() {
  const superAdminUsername = normalizeString(process.env.SUPERADMIN_USERNAME) || 'superadmin';
  const superAdminPassword = normalizeString(process.env.SUPERADMIN_PASSWORD);

  const adminUsername = normalizeString(process.env.ADMIN_USERNAME) || 'admin';
  const adminPassword = normalizeString(process.env.ADMIN_PASSWORD);

  console.log('🌱 Seeding database users (Super Admin + Admin)...');

  requireCredential('SUPERADMIN_PASSWORD', superAdminPassword, { minLength: 8 });
  requireCredential('SUPERADMIN_USERNAME', superAdminUsername, { minLength: 1 });

  const superAdmin = await upsertUser({
    username: superAdminUsername,
    password: superAdminPassword,
    role: 'super_admin',
  });
  console.log(`✅ Super Admin created/updated: ${superAdmin.username} (ID: ${superAdmin.id})`);

  if (adminPassword) {
    requireCredential('ADMIN_PASSWORD', adminPassword, { minLength: 8 });
    requireCredential('ADMIN_USERNAME', adminUsername, { minLength: 1 });

    const admin = await upsertUser({
      username: adminUsername,
      password: adminPassword,
      role: 'admin',
    });
    console.log(`✅ Admin created/updated: ${admin.username} (ID: ${admin.id})`);
  } else {
    console.log('ℹ️  ADMIN_PASSWORD not set; skipped creating/updating the admin user.');
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  });

