#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

const electronPath = require.resolve('electron/cli.js');
const appPath = path.resolve(__dirname, '..');

require('child_process').spawn(process.execPath, [electronPath, appPath], {
  stdio: 'inherit',
  detached: true
}).unref();

process.exit(0);
