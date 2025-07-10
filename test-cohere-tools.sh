#!/bin/bash

# Comprehensive tool compatibility test for Cohere integration

echo "========================================"
echo "Cohere Tool Compatibility Test"
echo "========================================"
echo ""

# Check if API keys are set
if [ -z "$COHERE_API_KEY" ] && [ -z "$CO_API_KEY_STAGING" ]; then
    echo "❌ Error: Please set COHERE_API_KEY or CO_API_KEY_STAGING environment variable"
    exit 1
fi

# Determine which provider to use
if [ -n "$COHERE_API_KEY" ]; then
    PROVIDER="cohere"
    echo "Using Cohere production API"
else
    PROVIDER="coherestaging"
    echo "Using Cohere staging API"
fi

# Create a test directory
TEST_DIR="/tmp/cohere-tool-test-$(date +%s)"
mkdir -p "$TEST_DIR"
cd "$TEST_DIR"
echo "Test directory: $TEST_DIR"
echo ""

# Function to run a test
run_test() {
    local test_name="$1"
    local command="$2"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "Test: $test_name"
    echo "Command: gemini --provider $PROVIDER \"$command\""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Using the actual CLI path
    /Users/justinchiu/code/gemini-cli/packages/cli/dist/cli.js --provider "$PROVIDER" "$command"
    
    echo ""
    echo ""
}

# Test 1: Shell Tool
run_test "Shell Tool - Echo" "Run echo 'Hello from Cohere tools test'"

# Test 2: Shell Tool - PWD
run_test "Shell Tool - PWD" "Run pwd and tell me what directory I'm in"

# Test 3: File Write Tool
run_test "Write File Tool" "Create a file named test.txt with the content 'This is a test file created by Cohere'"

# Test 4: File Read Tool
run_test "Read File Tool" "Read the file test.txt and tell me what it contains"

# Test 5: LS Tool
run_test "LS Tool" "List all files in the current directory"

# Test 6: Edit Tool
run_test "Edit Tool" "Edit the file test.txt and change 'test file' to 'demonstration file'"

# Test 7: Grep Tool
run_test "Grep Tool" "Search for the word 'demonstration' in all files in the current directory"

# Test 8: Create and read multiple files
run_test "Multiple File Operations" "Create three files: file1.txt with 'First file', file2.txt with 'Second file', and file3.txt with 'Third file'"

# Test 9: Glob Tool
run_test "Glob Tool" "Find all .txt files in the current directory"

# Test 10: Complex multi-tool scenario
run_test "Multi-tool Scenario" "List all .txt files, read their contents, and create a summary.txt file with a list of all files and their first line"

# Test 11: Shell Tool - More complex command
run_test "Shell Tool - Complex" "Run 'ls -la | grep txt' and explain the output"

# Test 12: Web Fetch Tool (if available)
run_test "Web Fetch Tool" "Fetch the title of https://example.com"

# Test 13: Memory Tool
run_test "Memory Tool" "Remember that my favorite color is blue, then tell me what my favorite color is"

echo "========================================"
echo "Tool Compatibility Test Complete!"
echo "========================================"
echo ""
echo "Test artifacts are in: $TEST_DIR"
echo ""

# Cleanup option
echo "Do you want to clean up the test directory? (y/n)"
read -r cleanup
if [ "$cleanup" = "y" ]; then
    rm -rf "$TEST_DIR"
    echo "Test directory cleaned up."
fi