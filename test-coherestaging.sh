#!/bin/bash

echo "Testing Cohere Staging integration..."
echo "Make sure CO_API_KEY_STAGING environment variable is set"
echo ""

# First, let's check if the env var is set
if [ -z "$CO_API_KEY_STAGING" ]; then
    echo "ERROR: CO_API_KEY_STAGING environment variable is not set"
    echo "Please set it with: export CO_API_KEY_STAGING='your-staging-api-key'"
    exit 1
fi

echo "CO_API_KEY_STAGING is set (length: ${#CO_API_KEY_STAGING})"
echo ""

# Build the project
echo "Building project..."
npm run build

echo ""
echo "Testing basic query with Cohere Staging..."
echo "What is 2+2?" | DEBUG=1 node packages/cli/dist/index.js --provider coherestaging --model c3-sweep-ecsydrkq-690h-fp16 -d