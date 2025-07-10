# Cohere V2 Tools Guide

This guide explains how to use tools (function calling) with Cohere's V2 API using the TypeScript SDK.

## Key Concepts

### 1. Tool Definition (ToolV2)

Tools are defined using the `ToolV2` type:

```typescript
interface ToolV2 {
    type?: "function";
    function?: {
        name: string;
        description?: string;
        parameters: Record<string, unknown>; // JSON Schema
    };
}
```

### 2. Tool Calls (ToolCallV2)

When the model wants to use a tool, it returns `ToolCallV2` objects:

```typescript
interface ToolCallV2 {
    id?: string;          // Unique ID for this tool call
    type?: "function";
    function?: {
        name?: string;    // Function name to call
        arguments?: string; // JSON string of arguments
    };
}
```

### 3. Tool Messages (ToolMessageV2)

Tool results are sent back using tool messages:

```typescript
interface ToolMessageV2 {
    role: "tool";
    toolCallId: string;  // Must match the tool call ID
    content: string | ToolContent[]; // Tool execution result
}
```

## Basic Flow

1. **Define tools** and include them in your chat request
2. **Receive tool calls** from the assistant
3. **Execute the tools** with the provided arguments
4. **Send results back** as tool messages
5. **Get final response** from the assistant

## Example Usage

### Simple Tool Definition

```typescript
const tools: ToolV2[] = [{
    type: "function",
    function: {
        name: "get_weather",
        description: "Get weather for a location",
        parameters: {
            type: "object",
            properties: {
                location: { type: "string" }
            },
            required: ["location"]
        }
    }
}];
```

### Complete Conversation Flow

```typescript
// 1. Initial request with tools
const response1 = await client.chat({
    model: "command-r-plus",
    messages: [{ role: "user", content: "What's the weather?" }],
    tools: tools
});

// 2. Execute tool calls
const toolResults = response1.toolCalls?.map(toolCall => ({
    role: "tool",
    toolCallId: toolCall.id!,
    content: JSON.stringify(executeFunction(toolCall))
}));

// 3. Send everything back
const finalResponse = await client.chat({
    model: "command-r-plus",
    messages: [
        { role: "user", content: "What's the weather?" },
        { role: "assistant", content: "", toolCalls: response1.toolCalls },
        ...toolResults
    ],
    tools: tools
});
```

## Streaming with Tools

When streaming, tool calls come through these events:

- `tool-call-start`: Beginning of a tool call
- `tool-call-delta`: Streaming chunks of arguments
- `tool-call-end`: Tool call complete

```typescript
const stream = await client.chatStream({
    model: "command-r-plus",
    messages: messages,
    tools: tools
});

for await (const event of stream) {
    switch (event.type) {
        case "tool-call-start":
            // Initialize tool call
            break;
        case "tool-call-delta":
            // Accumulate arguments
            break;
        case "tool-call-end":
            // Tool call ready to execute
            break;
    }
}
```

## Important Notes

1. **Tool Choice**: Use `toolChoice` parameter to control tool usage:
   - `"REQUIRED"`: Force tool use
   - `"NONE"`: Prevent tool use
   - Default: Model decides

2. **Strict Tools**: Set `strictTools: true` to enforce strict parameter validation

3. **Multiple Tools**: The model can call multiple tools in a single response

4. **Tool Results Format**: Tool results should be JSON-serializable strings

## Type Imports

```typescript
import { CohereClientV2 } from "cohere-ai";
import { 
    ToolV2, 
    ToolCallV2, 
    ChatMessageV2,
    StreamedChatResponseV2 
} from "cohere-ai/api/types";
```

## Error Handling

Always validate:
- Tool call has valid `id`, `function.name`, and `function.arguments`
- Arguments can be parsed as JSON
- Tool execution doesn't throw errors
- Tool results are properly formatted

## Complete Examples

See the provided example files:
- `cohere-v2-tools-simple.ts`: Basic tool usage
- `cohere-v2-tools-example.ts`: Advanced examples with multiple tools and streaming