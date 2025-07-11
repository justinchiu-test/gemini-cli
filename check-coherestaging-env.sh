#!/bin/bash

echo "Checking Cohere Staging Environment..."
echo "======================================"
echo ""

if [ -z "$CO_API_KEY_STAGING" ]; then
    echo "❌ CO_API_KEY_STAGING is NOT set"
    exit 1
else
    echo "✅ CO_API_KEY_STAGING is set"
    echo "   Length: ${#CO_API_KEY_STAGING} characters"
    echo "   First 10 chars: ${CO_API_KEY_STAGING:0:10}..."
    echo "   Last 4 chars: ...${CO_API_KEY_STAGING: -4}"
fi

echo ""
echo "Testing with curl..."
echo "===================="

# Test the staging endpoint
echo "Testing https://stg.api.cohere.com/v2/chat"
curl -s -X POST https://stg.api.cohere.com/v2/chat \
  -H "Authorization: Bearer $CO_API_KEY_STAGING" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "c3-sweep-ecsydrkq-690h-fp16",
    "messages": [{"role": "user", "content": "Hello"}]
  }' | jq . || echo "Failed to parse JSON response"