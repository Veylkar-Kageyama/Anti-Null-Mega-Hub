'use strict';

const { spawn } = require('node:child_process');
const electron = require('electron');
const path = require('node:path');

const adminEmail = process.env.LOCAL_ADMIN_EMAIL || 'admin@localhost.test';
const child = spawn(electron, [path.join(__dirname, '..')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    PORT: '0',
    MONGODB_URI: 'mongodb://127.0.0.1:27017/anti_null_local?replicaSet=rs0',
    INITIAL_ADMIN_EMAIL: adminEmail,
    INITIAL_ADMIN_TOKEN: process.env.LOCAL_ADMIN_TOKEN || 'anti-null-local-bootstrap',
    OWNER_EMAIL: adminEmail
  }
});

child.on('error', (error) => {
  console.error(`Could not start the local desktop app: ${error.message}`);
  process.exitCode = 1;
});
child.on('exit', (code, signal) => {
  process.exitCode = signal ? 1 : code ?? 1;
});
