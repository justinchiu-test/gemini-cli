#!/usr/bin/env node

// Test script for Cohere Staging with tools
const { spawn } = require('child_process');
const path = require('path');

// Check if CO_API_KEY_STAGING is set
if (!process.env.CO_API_KEY_STAGING) {
  console.error('ERROR: CO_API_KEY_STAGING environment variable is not set');
  console.error('Please set it with: export CO_API_KEY_STAGING=\'your-staging-api-key\'');
  process.exit(1);
}

console.log('Testing Cohere Staging integration with tools...');
console.log(`CO_API_KEY_STAGING is set (length: ${process.env.CO_API_KEY_STAGING.length})`);
console.log('');

const cliPath = path.join(__dirname, 'packages/cli/dist/index.js');

// Test 1: Basic query
console.log('Test 1: Basic query');
const test1 = spawn('node', [
  cliPath,
  '--provider', 'coherestaging',
  '--model', 'c3-sweep-ecsydrkq-690h-fp16',
  '-d',
  'What is the capital of France?'
], {
  env: { ...process.env, DEBUG: '1' }
});

test1.stdout.on('data', (data) => {
  process.stdout.write(data);
});

test1.stderr.on('data', (data) => {
  process.stderr.write(data);
});

test1.on('close', (code) => {
  console.log(`\nTest 1 exited with code ${code}\n`);
  
  if (code === 0) {
    // Test 2: Tool usage
    console.log('Test 2: Tool usage (list directory)');
    const test2 = spawn('node', [
      cliPath,
      '--provider', 'coherestaging',
      '--model', 'c3-sweep-ecsydrkq-690h-fp16',
      '-d',
      'List the files in the current directory'
    ], {
      env: { ...process.env, DEBUG: '1' }
    });

    test2.stdout.on('data', (data) => {
      process.stdout.write(data);
    });

    test2.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    test2.on('close', (code2) => {
      console.log(`\nTest 2 exited with code ${code2}\n`);
    });
  }
});