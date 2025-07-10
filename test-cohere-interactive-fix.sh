#!/bin/bash

echo "Testing Cohere interactive mode with tool calls..."
echo "Type 'run ls' when prompted and then 'exit' to quit"
echo ""

# Run in interactive mode with debug enabled
npm run cli -- --provider cohere --debug -i