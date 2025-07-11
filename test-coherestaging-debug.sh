#!/bin/bash

# Test script to debug coherestaging provider

echo "Testing coherestaging provider with debug logging..."
echo ""

# Check if CO_API_KEY_STAGING is set
if [ -z "$CO_API_KEY_STAGING" ]; then
    echo "WARNING: CO_API_KEY_STAGING environment variable is not set!"
    echo "Please set it and try again."
    exit 1
fi

echo "CO_API_KEY_STAGING is set (length: ${#CO_API_KEY_STAGING})"
echo ""

# Run with debug mode
DEBUG=1 node packages/cli/dist/index.js --provider coherestaging --model c3-sweep-ecsydrkq-690h-fp16 -d "What is 1 + 1?"