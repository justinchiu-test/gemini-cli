#\!/bin/bash
set -e

echo "Building packages..."
npm run build

echo -e "\n=== Testing Cohere provider without tools ==="
export GEMINI_DISABLE_TOOLS=true
node packages/cli/dist/index.js --provider cohere -p "What is 2+2?"

echo -e "\n\n=== Testing with tool usage ==="
unset GEMINI_DISABLE_TOOLS
node packages/cli/dist/index.js --provider cohere -p "List the files in the current directory"
