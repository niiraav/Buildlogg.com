const { spawn } = require('child_process');
const fs = require('fs');

const out = fs.openSync('vite.log', 'a');
const err = fs.openSync('vite.log', 'a');

const child = spawn('npx', ['vite', '--host', '--force', '--port', '5173'], {
  detached: true,
  stdio: ['ignore', out, err]
});

child.unref();
console.log('Vite started with PID:', child.pid);
console.log('Access: http://localhost:5173/');
