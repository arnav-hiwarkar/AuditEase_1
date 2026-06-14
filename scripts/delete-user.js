#!/usr/bin/env node
'use strict';
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'auditease.db');

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(flag) {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : null;
}

const username = getArg('--username');

if (!username) {
  console.error('Usage: node scripts/delete-user.js --username johndoe');
  process.exit(1);
}

(() => {
  try {
    const db = new Database(DB_PATH);
    db.pragma('foreign_keys = ON');

    // Find user
    const user = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (!user) {
      console.error(`❌ Error: User "${username}" not found.`);
      process.exit(1);
    }

    // Check references in documents table
    const docRefs = db.prepare(`
      SELECT COUNT(*) as count FROM documents 
      WHERE original_uploader_id = ? OR last_uploader_id = ? OR approver_id = ?
    `).get(user.id, user.id, user.id);

    if (docRefs.count > 0) {
      console.error(`❌ Error: Cannot delete user "${username}".`);
      console.error(`   They have ${docRefs.count} document record(s) linked to them (as uploader or approver).`);
      console.error(`   Reassign or archive those documents in the database first.`);
      db.close();
      process.exit(1);
    }

    // Clean up visits
    db.prepare('DELETE FROM user_page_visits WHERE user_id = ?').run(user.id);

    // Delete user
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);

    console.log(`✅ User "${username}" deleted successfully.`);
    db.close();
  } catch (err) {
    console.error('❌ Failed to delete user:', err.message);
    process.exit(1);
  }
})();
