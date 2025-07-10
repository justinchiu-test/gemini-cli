# Cohere Interactive Mode Fix Implementation

## Problem
In interactive mode, when using Cohere provider:
- Tool calls were made successfully
- But before tool responses were added to conversation history, another API call occurred
- This caused Cohere to reject with "tool_call_ids did not have response messages"

## Root Cause
The `isResponding` flag was being set to `false` immediately after stream processing completed, even though tools were still executing asynchronously. This allowed other parts of the system to make API calls while tools were still running.

## Solution Implemented

### 1. Track Running Tools
Added logic to check if any tools are still in a non-terminal state:
```typescript
const hasRunningTools = useMemo(() => {
  return toolCalls.some(
    (tc) =>
      tc.status === 'validating' ||
      tc.status === 'scheduled' ||
      tc.status === 'executing' ||
      tc.status === 'awaiting_approval'
  );
}, [toolCalls]);
```

### 2. Keep isResponding True While Tools Run
Modified the `finally` block in `submitQuery` to only set `isResponding(false)` if no tools are running:
```typescript
finally {
  // Don't set isResponding to false if tools are still running
  if (!toolCalls.some(tc => 
    tc.status === 'validating' ||
    tc.status === 'scheduled' ||
    tc.status === 'executing' ||
    tc.status === 'awaiting_approval'
  )) {
    setIsResponding(false);
  }
}
```

### 3. Set isResponding False When Tools Complete
Added logic in `handleCompletedTools` to set `isResponding(false)` when there are no tools to submit and no tools are running.

### 4. Added useEffect for Edge Cases
Added a `useEffect` to ensure `isResponding` is eventually set to false when all tools complete:
```typescript
useEffect(() => {
  if (isResponding && !hasRunningTools && toolCalls.length > 0) {
    // All tools have completed
    setIsResponding(false);
  }
}, [isResponding, hasRunningTools, toolCalls.length]);
```

## Result
This prevents any API calls from being made while tools are still executing, ensuring that tool responses are properly added to the conversation history before the next Cohere API call.

## Testing
To test the fix:
```bash
# Set up environment
export COHERE_API_KEY="your-api-key"

# Run interactive mode
./packages/cli/dist/index.js --provider cohere -i

# Test commands:
> hi
> run ls
> create a file test.txt
```

The tool calls should now work correctly without the "missing tool response" error.