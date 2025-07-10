#!/bin/bash

# Script to run the Cohere V2 tool calling example

echo "Setting up Cohere V2 Tool Calling Example..."
echo "==========================================="

# Check if COHERE_API_KEY is set
if [ -z "$COHERE_API_KEY" ] && [ -z "$CO_API_KEY_STAGING" ]; then
    echo "❌ Error: Please set COHERE_API_KEY or CO_API_KEY_STAGING environment variable"
    echo ""
    echo "For production Cohere API:"
    echo "  export COHERE_API_KEY='your-api-key'"
    echo ""
    echo "For staging Cohere API:"
    echo "  export CO_API_KEY_STAGING='your-staging-api-key'"
    echo ""
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "cohere-typescript" ]; then
    echo "❌ Error: cohere-typescript directory not found"
    echo "Please run this from the gemini-cli directory"
    exit 1
fi

# Install dependencies for cohere-typescript if needed
if [ ! -d "cohere-typescript/node_modules" ]; then
    echo "📦 Installing cohere-typescript dependencies..."
    cd cohere-typescript
    npm install
    cd ..
fi

# Update the simple example to use staging if needed
if [ -n "$CO_API_KEY_STAGING" ] && [ -z "$COHERE_API_KEY" ]; then
    echo "🔧 Configuring for staging environment..."
    # Create a staging version of the example
    sed 's/COHERE_API_KEY/CO_API_KEY_STAGING/g' cohere-v2-tools-simple.ts > cohere-v2-tools-simple-staging.ts
    sed -i '' 's|new CohereClientV2({|new CohereClientV2({\n    baseURL: "https://stg.api.cohere.ai/compatibility/v1",|g' cohere-v2-tools-simple-staging.ts
    sed -i '' 's/command-r-plus/c3-sweep-ecsydrkq-690h-fp16/g' cohere-v2-tools-simple-staging.ts
    EXAMPLE_FILE="cohere-v2-tools-simple-staging.ts"
else
    EXAMPLE_FILE="cohere-v2-tools-simple.ts"
fi

echo ""
echo "🚀 Running Cohere V2 Tool Calling Example..."
echo "==========================================="
echo ""

# Run the example using tsx (TypeScript runner)
npx tsx "$EXAMPLE_FILE"

# Clean up staging file if created
if [ "$EXAMPLE_FILE" = "cohere-v2-tools-simple-staging.ts" ]; then
    rm -f cohere-v2-tools-simple-staging.ts
fi