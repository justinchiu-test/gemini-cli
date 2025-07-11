#!/bin/bash

echo "Testing Cohere Staging with command model..."
echo "==========================================="

# First try with a simple model that might exist
echo "Hi" | DEBUG=1 node packages/cli/dist/index.js --provider coherestaging -d 2>&1 | grep -E "(DEBUG|Error|✅|✕|Hi)"