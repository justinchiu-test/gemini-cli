#!/bin/bash

echo "Simple Cohere Staging Test"
echo "========================="

# Check environment variable
if [ -z "$CO_API_KEY_STAGING" ]; then
    echo "ERROR: CO_API_KEY_STAGING not set"
    exit 1
fi

# Build first
echo "Building..."
npm run build > /dev/null 2>&1

# Simple math question (no tools needed)
echo ""
echo "Test: What is 2 + 2?"
echo "-------------------"
echo "What is 2 + 2?" | DEBUG=1 node packages/cli/dist/index.js --provider coherestaging -d

echo ""
echo "Exit code: $?"