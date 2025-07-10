#!/usr/bin/env node
/**
 * Test script to verify Cohere integration fixes
 */

const { spawn } = require('child_process');
const path = require('path');

const CLI_PATH = path.join(__dirname, 'packages/cli/dist/index.js');

// Color output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function runTest(name, args, expectedPattern, expectError = false) {
  return new Promise((resolve) => {
    console.log(`\n${YELLOW}Testing: ${name}${RESET}`);
    console.log(`Command: node ${CLI_PATH} ${args.join(' ')}`);
    
    const child = spawn('node', [CLI_PATH, ...args], {
      env: { ...process.env },
      stdio: ['inherit', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      const output = stdout + stderr;
      const passed = expectError ? 
        (code !== 0 && output.includes(expectedPattern)) :
        (code === 0 && (!expectedPattern || output.includes(expectedPattern)));
        
      if (passed) {
        console.log(`${GREEN}✓ PASSED${RESET}`);
        resolve(true);
      } else {
        console.log(`${RED}✗ FAILED${RESET}`);
        console.log(`Expected ${expectError ? 'error' : 'success'} with pattern: "${expectedPattern}"`);
        console.log(`Exit code: ${code}`);
        resolve(false);
      }
    });
  });
}

async function main() {
  console.log(`${YELLOW}=== Cohere Integration Fix Tests ===${RESET}`);
  
  if (!process.env.COHERE_API_KEY) {
    console.log(`${RED}ERROR: COHERE_API_KEY environment variable not set${RESET}`);
    process.exit(1);
  }
  
  const tests = [
    // Test 1: Basic arithmetic (no tools, no generateJson)
    {
      name: 'Basic arithmetic - should work',
      args: ['--provider', 'cohere', '-p', '1+1'],
      expectedPattern: '2'
    },
    
    // Test 2: Simple shell command
    {
      name: 'Shell command echo - should work',
      args: ['--provider', 'cohere', '-p', 'Run echo hello'],
      expectedPattern: 'hello'
    },
    
    // Test 3: Shell command with ls (tests directory handling)
    {
      name: 'Shell command ls - should work',
      args: ['--provider', 'cohere', '-p', 'Run ls'],
      expectedPattern: 'packages'
    },
    
    // Test 4: File operations
    {
      name: 'Create and read file - should work',
      args: ['--provider', 'cohere', '-p', 'Create a file test-cohere.txt with content "Hello from Cohere"'],
      expectedPattern: 'test-cohere.txt'
    },
    
    // Test 5: Clean up file
    {
      name: 'Delete test file - should work',
      args: ['--provider', 'cohere', '-p', 'Delete the file test-cohere.txt'],
      expectedPattern: 'test-cohere.txt'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    const result = await runTest(test.name, test.args, test.expectedPattern, test.expectError);
    if (result) passed++;
    else failed++;
  }
  
  console.log(`\n${YELLOW}=== Test Summary ===${RESET}`);
  console.log(`${GREEN}Passed: ${passed}${RESET}`);
  console.log(`${RED}Failed: ${failed}${RESET}`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);