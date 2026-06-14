#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const SALT_ROUNDS = 12;
const DB_PATH = path.join(__dirname, '..', 'auditease.db');

const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const username = getArg('--username');
const password = getArg('--password');

if (!username || !password) {
  console.error('Usage: node scripts/change-password.js --username johndoe --password newsecurepass123');
  process.exit(1);
}

(async () => {
  try {
    const db = new Database(DB_PATH);
    
    // Check if user exists
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      console.error(`❌ Error: User "${username}" not found.`);
      process.exit(1);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, user.id);

    console.log(`✅ Password updated successfully for user "${username}".`);
    db.close();
  } catch (err) {
    console.error('❌ Failed to update password:', err.message);
    process.exit(1);
  }
})();
