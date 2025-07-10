# Cohere Interactive Mode Tool Response Issue Analysis

## Problem Summary
In interactive mode, when using Cohere provider:
1. User types "run ls"
2. Cohere generates a tool call with ID `list_directory_18gaz0g1nt9v`
3. Tool executes successfully
4. API call is made BEFORE tool response is added to conversation history
5. Cohere rejects with "tool_call_ids did not have response messages"

## Root Cause
The conversation history at the time of the error shows:
- 4 items: user → model → user → model (with functionCall)
- NO function response for the tool call

This indicates a race condition where the next API call happens before tool responses are processed.

## Why This Happens
1. In interactive mode, tools are executed asynchronously
2. The `checkNextSpeaker` is already disabled for Cohere (via `supportsJsonMode` check)
3. Something else is triggering an API call before tools complete
4. Likely the Cohere model itself is trying to continue after generating tool calls

## Potential Solutions

### Solution 1: Prevent Continuation During Tool Execution
Add a check in the streaming response handler to prevent any continuation while tools are being executed.

### Solution 2: Force Synchronous Tool Response Addition
Ensure tool responses are immediately added to conversation history before any other API calls.

### Solution 3: Add a Cohere-Specific Check
In the Cohere provider, check if the last message has tool calls without responses and wait for them.

## Temporary Workaround
For now, users can work around this by:
1. Using non-interactive mode: `--provider cohere -p "run ls"`
2. Waiting for tools to complete before typing the next command
3. Using simpler commands that don't require tools

## Next Steps
The most robust fix would be to ensure that in interactive mode, no API calls are made while tools are executing or until their responses are added to the conversation history.