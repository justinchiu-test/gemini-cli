#!/bin/bash
# Basic test script for Cohere integration fixes

CLI_PATH="./packages/cli/dist/index.js"

echo "=== Testing Cohere Integration Fixes ==="

if [ -z "$COHERE_API_KEY" ]; then
    echo "ERROR: COHERE_API_KEY environment variable not set"
    exit 1
fi

echo -e "\n1. Testing basic arithmetic (no tools, no generateJson)..."
node $CLI_PATH --provider cohere -p "What is 2+2?"

echo -e "\n2. Testing simple shell command..."
node $CLI_PATH --provider cohere -p "Run echo hello world"

echo -e "\n3. Testing shell command with ls..."
node $CLI_PATH --provider cohere -p "Run ls packages"

echo -e "\n4. Testing file creation..."
node $CLI_PATH --provider cohere -p "Create a file test-cohere.txt with the content 'Hello from Cohere'"

echo -e "\n5. Testing file reading..."
node $CLI_PATH --provider cohere -p "Read the file test-cohere.txt"

echo -e "\n6. Cleaning up..."
node $CLI_PATH --provider cohere -p "Delete the file test-cohere.txt"

echo -e "\n=== All tests completed ==="