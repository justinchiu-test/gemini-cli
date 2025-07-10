# Running the Cohere V2 Tool Calling Example

## Prerequisites

1. **API Key**: You need either a production or staging Cohere API key
2. **Node.js**: Ensure you have Node.js installed (v16 or higher)
3. **Dependencies**: The script will automatically install required dependencies

## Quick Start

### Option 1: Using the Shell Script (Recommended)

```bash
# For production API:
export COHERE_API_KEY="your-api-key"
./run-cohere-tool-example.sh

# For staging API:
export CO_API_KEY_STAGING="your-staging-api-key"
./run-cohere-tool-example.sh
```

### Option 2: Manual Execution

```bash
# 1. Set your API key
export COHERE_API_KEY="your-api-key"  # or CO_API_KEY_STAGING for staging

# 2. Install cohere-typescript dependencies
cd cohere-typescript
npm install
cd ..

# 3. Run the example
npx tsx cohere-v2-tools-simple.ts
```

### Option 3: For Staging Environment

If using the staging environment, you'll need to modify the example:

```typescript
// In cohere-v2-tools-simple.ts, change:
const client = new CohereClientV2({
    token: process.env.CO_API_KEY_STAGING!,
    baseURL: "https://stg.api.cohere.ai/compatibility/v1"
});

// Also change the model:
model: "c3-sweep-ecsydrkq-690h-fp16"  // instead of "command-r-plus"
```

## What the Example Does

The example demonstrates:
1. **Defining a tool** - A simple weather function
2. **Making a request** - Asking about weather triggers the tool
3. **Handling tool calls** - The model requests to use the weather tool
4. **Executing the tool** - Mock implementation returns weather data
5. **Sending results back** - Tool results sent as part of conversation
6. **Getting final response** - Model uses tool results to answer

## Expected Output

```
User: What's the weather in Paris?

Assistant wants to call tool:
[
  {
    "id": "...",
    "type": "function",
    "function": {
      "name": "get_weather",
      "arguments": "{\"location\":\"Paris\"}"
    }
  }
]

Assistant final response:
The current weather in Paris is 18°C and partly cloudy.
```

## Troubleshooting

1. **API Key Error**: Make sure your API key is set correctly
2. **Module Not Found**: Run `npm install` in the cohere-typescript directory
3. **Network Error**: Check your internet connection and API endpoint
4. **Model Error**: For staging, use the staging model (c3-sweep-ecsydrkq-690h-fp16)

## Next Steps

- Try the comprehensive example: `npx tsx cohere-v2-tools-example.ts`
- Modify the tool to do something different
- Add multiple tools to see how the model chooses between them
- Implement streaming to see real-time tool calls