# Gemini CLI Tool Execution Workflow

This document describes the complete workflow for tool execution in the Gemini CLI interactive mode, from user request to displaying results, and how to ensure it works correctly with Cohere models.

## Overview

The tool execution workflow follows these steps:
1. User submits a request in interactive mode
2. AI model responds with tool call requests
3. System asks for permission to execute tools (if needed)
4. Tools are executed with live output
5. Results are displayed in the UI
6. Tool responses are added to conversation history
7. AI provides final response incorporating tool results

## Detailed Workflow

### 1. User Request → Tool Call Response

**Entry Point**: `packages/cli/src/ui/App.tsx`
- User types a command like "run ls" or "list files"
- `InputPrompt` component captures the input
- `submitQuery` is called from `useGeminiStream` hook

**Processing**: `packages/cli/src/ui/hooks/useGeminiStream.ts`
```typescript
// submitQuery sends the message to the AI model
const stream = geminiClient.sendMessageStream(queryToSend, abortSignal, prompt_id);

// Process streaming events from the AI
const processingStatus = await processGeminiStreamEvents(stream, userMessageTimestamp, abortSignal);
```

**AI Response**: The AI model analyzes the request and responds with:
- Text content explaining what it will do
- Tool call requests (e.g., `run_shell_command` or `list_directory`)

### 2. Tool Call Processing

**Event Processing**: In `processGeminiStreamEvents`
```typescript
case ServerGeminiEventType.ToolCallRequest:
  toolCallRequests.push(event.value);  // Collect tool requests
  break;

// After all events processed:
if (toolCallRequests.length > 0) {
  scheduleToolCalls(toolCallRequests, signal);  // Schedule for execution
}
```

### 3. Permission/Confirmation Flow

**Tool Scheduler**: `packages/core/src/core/CoreToolScheduler.ts`

1. **Validation**: Tool parameters are validated
2. **Confirmation Check**: 
   ```typescript
   const confirmationDetails = await toolInstance.shouldConfirmExecute(params, signal);
   ```
   - For shell commands: Returns confirmation details if not whitelisted
   - For file edits: Always asks for confirmation
   - For read operations: Usually no confirmation needed

3. **UI Display**: If confirmation needed, status is set to `awaiting_approval`

**Confirmation UI**: `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`
- Displays tool information in a bordered box
- Shows options:
  - "Yes, allow once" - Execute this specific command
  - "Yes, allow always 'command...'" - Whitelist this command pattern
  - "No (esc)" - Cancel execution

### 4. Tool Execution

**After Approval**: Tool status changes from `awaiting_approval` → `scheduled` → `executing`

**Execution**: In `CoreToolScheduler.attemptExecutionOfScheduledCalls`
```typescript
toolInstance.execute(params, signal, liveOutputCallback)
  .then(async (toolResult: ToolResult) => {
    // Process successful result
    const response = convertToFunctionResponse(toolName, callId, toolResult.llmContent);
    this.setStatusInternal(callId, 'success', response);
  })
  .catch((error: Error) => {
    // Handle execution error
    this.setStatusInternal(callId, 'error', errorResponse);
  });
```

### 5. Result Display

**Live Output**: During execution, tools can provide real-time updates
- Shell commands show output as it streams
- File operations show progress

**Final Display**: `packages/cli/src/ui/components/messages/ToolMessage.tsx`
- Success: ✓ checkmark with green color
- Error: ✗ with red color and error message
- Results displayed in tool's output area

### 6. History Management

**Tool Completion**: In `useGeminiStream.handleCompletedTools`
```typescript
// 1. Add tool display to UI history
addItem(mapTrackedToolCallsToDisplay(completedToolCalls), Date.now());

// 2. Add function responses to conversation history
geminiClient.addHistory({
  role: 'user',
  parts: responseParts,  // Tool execution results
});

// 3. Send results back to AI for continuation
await submitQuery(toolResponses, { isContinuation: true }, prompt_id);
```

## Cohere Integration Issues and Solutions

### Current Issues with Cohere

1. **Tool Result Display**: Cohere includes tool results in its text response instead of keeping them separate
2. **Duplicate Output**: Tool results appear twice - once in tool display, once in Cohere's response
3. **Formatting**: Cohere wraps tool output in `<pre><code>` blocks

### Making it Work with Cohere

To ensure proper tool execution with Cohere models:

#### 1. **Tool Call Detection**
Cohere sends tool calls differently than Gemini:
- Uses `tool-call-start`, `tool-call-delta`, `tool-call-end` events
- Tool arguments come incrementally in deltas

**Solution**: Already implemented in `CohereContentGenerator.ts`

#### 2. **Prevent Result Echo**
Cohere tends to include tool results in its response text.

**Solution Options**:
- Filter out tool result echoes from Cohere's text response
- Detect when Cohere is just repeating tool output
- Use a different prompt to instruct Cohere not to repeat results

#### 3. **Proper UI Display**
Ensure tool results are displayed in the UI tool boxes, not in the assistant's message.

**Implementation needed**:
```typescript
// In CohereContentGenerator, track recent tool executions
private recentToolResults: Map<string, string> = new Map();

// When processing content-delta events:
case 'content-delta':
  const deltaText = event.delta.message.content.text;
  // Check if this text matches recent tool output
  if (!this.isToolResultEcho(deltaText)) {
    accumulatedText += deltaText;
    yield this.createStreamResponse(deltaText, [], usageMetadata);
  }
  break;
```

#### 4. **Conversation History**
Ensure tool responses are properly formatted in the conversation history:
- Use `role: 'tool'` messages with proper `toolCallId`
- Include tool results as structured data, not plain text

### Recommended Fixes

1. **Add Tool Result Filtering**:
   - Track tool execution results
   - Filter out exact matches from Cohere's text responses
   - Preserve Cohere's analysis/commentary about results

2. **Improve Tool Response Format**:
   - Send clear markers to Cohere about tool boundaries
   - Use system prompts to instruct Cohere on handling tool results

3. **UI Enhancements**:
   - Ensure tool displays are always shown for executed tools
   - Hide duplicate content from assistant messages

4. **Testing**:
   - Create integration tests for Cohere tool execution
   - Verify all tool types work correctly
   - Ensure conversation flow remains natural

## Key Files Reference

- **Main Flow**: `packages/cli/src/ui/hooks/useGeminiStream.ts`
- **Tool Scheduling**: `packages/core/src/core/CoreToolScheduler.ts`
- **UI Components**: 
  - `packages/cli/src/ui/components/messages/ToolGroupMessage.tsx`
  - `packages/cli/src/ui/components/messages/ToolMessage.tsx`
  - `packages/cli/src/ui/components/messages/ToolConfirmationMessage.tsx`
- **Cohere Integration**: `packages/core/src/providers/cohereContentGenerator.ts`
- **Tool Implementations**: `packages/core/src/tools/` directory

## Testing the Workflow

To verify the workflow is working correctly:

1. **Basic Tool Execution**:
   ```
   > List files in the current directory
   > Run echo "Hello World"
   ```

2. **Permission Flow**:
   ```
   > Delete test.txt  (should ask for confirmation)
   > Run rm test.txt  (should ask for shell permission)
   ```

3. **Complex Workflows**:
   ```
   > Create a Python script that prints numbers 1-10 and run it
   > Search for all TypeScript files and show me the largest one
   ```

Each test should show:
- Clear tool execution status
- Proper permission prompts when needed
- Clean result display
- Natural conversation flow