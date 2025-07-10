#!/bin/bash
# Test script for debugging Cohere interactive mode tool response issue

echo "=== Cohere Interactive Mode Debug Test ==="
echo "This will help diagnose the tool response ID matching issue"
echo ""

if [ -z "$COHERE_API_KEY" ]; then
    echo "ERROR: COHERE_API_KEY environment variable not set"
    exit 1
fi

echo "Starting interactive mode with DEBUG enabled..."
echo "Try these commands in order:"
echo "1. Type: hi"
echo "2. Type: run ls"
echo "3. Type: exit"
echo ""
echo "Watch for:"
echo "- WARNING: No tool response found for tool call ID"
echo "- DEBUG: Processing function response with ID"
echo "- Tool call analysis in COHERE CONVERSATION HISTORY DEBUG"
echo ""

DEBUG=1 node ./packages/cli/dist/index.js --provider cohere -d
