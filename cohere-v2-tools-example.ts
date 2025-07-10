import { CohereClientV2 } from "./cohere-typescript/src/ClientV2";
import { ToolV2, ToolCallV2, ChatMessageV2 } from "./cohere-typescript/src/api/types";

// Initialize the Cohere V2 client
const client = new CohereClientV2({
    token: process.env.COHERE_API_KEY!,
    clientName: "v2-tools-example",
});

// Define tools that the model can use
const tools: ToolV2[] = [
    {
        type: "function",
        function: {
            name: "get_weather",
            description: "Get the current weather for a specific location",
            parameters: {
                type: "object",
                properties: {
                    location: {
                        type: "string",
                        description: "The city and state, e.g., San Francisco, CA"
                    },
                    unit: {
                        type: "string",
                        enum: ["celsius", "fahrenheit"],
                        description: "The temperature unit"
                    }
                },
                required: ["location"]
            }
        }
    },
    {
        type: "function", 
        function: {
            name: "calculate",
            description: "Perform basic arithmetic calculations",
            parameters: {
                type: "object",
                properties: {
                    expression: {
                        type: "string",
                        description: "The mathematical expression to evaluate"
                    }
                },
                required: ["expression"]
            }
        }
    }
];

// Mock function implementations
const toolImplementations = {
    get_weather: (params: { location: string; unit?: string }) => {
        // In a real implementation, this would call a weather API
        const temp = params.unit === "celsius" ? "22°C" : "72°F";
        return {
            location: params.location,
            temperature: temp,
            conditions: "Partly cloudy",
            humidity: "65%"
        };
    },
    calculate: (params: { expression: string }) => {
        // Simple eval for demo purposes - in production use a proper math parser
        try {
            const result = eval(params.expression);
            return { result: result.toString() };
        } catch (error) {
            return { error: "Invalid expression" };
        }
    }
};

async function runToolExample() {
    console.log("=== Cohere V2 Tools Example ===\n");

    // Step 1: Send initial message with tools
    console.log("Step 1: Sending initial message with available tools...");
    
    const messages: ChatMessageV2[] = [
        {
            role: "user",
            content: "What's the weather like in San Francisco and New York? Also, what's 25 * 4 + 10?"
        }
    ];

    const firstResponse = await client.chat({
        model: "command-r-plus",
        messages: messages,
        tools: tools
    });

    console.log("\nAssistant response:");
    console.log("Tool calls:", JSON.stringify(firstResponse.toolCalls, null, 2));

    // Step 2: Execute the tool calls
    console.log("\n\nStep 2: Executing tool calls...");
    
    const toolResults: ChatMessageV2[] = [];
    
    if (firstResponse.toolCalls) {
        for (const toolCall of firstResponse.toolCalls) {
            console.log(`\nExecuting tool: ${toolCall.function?.name}`);
            
            const functionName = toolCall.function?.name;
            const args = toolCall.function?.arguments;
            
            if (functionName && args) {
                const parsedArgs = JSON.parse(args);
                const result = toolImplementations[functionName as keyof typeof toolImplementations](parsedArgs);
                
                console.log(`Result: ${JSON.stringify(result)}`);
                
                // Add tool result message
                toolResults.push({
                    role: "tool",
                    toolCallId: toolCall.id!,
                    content: JSON.stringify(result)
                });
            }
        }
    }

    // Step 3: Send tool results back to get final response
    console.log("\n\nStep 3: Sending tool results back to the model...");
    
    // Reconstruct conversation with assistant's tool calls and tool results
    const updatedMessages: ChatMessageV2[] = [
        ...messages,
        {
            role: "assistant",
            content: firstResponse.message?.content?.[0]?.text || "",
            toolCalls: firstResponse.toolCalls
        },
        ...toolResults
    ];

    const finalResponse = await client.chat({
        model: "command-r-plus",
        messages: updatedMessages,
        tools: tools
    });

    console.log("\nFinal response:");
    console.log(finalResponse.message?.content?.[0]?.text);
}

// Example with streaming
async function runStreamingToolExample() {
    console.log("\n\n=== Cohere V2 Streaming Tools Example ===\n");

    const messages: ChatMessageV2[] = [
        {
            role: "user",
            content: "Calculate 15 * 8 and tell me the weather in London"
        }
    ];

    console.log("Streaming response with tools...");
    
    const stream = await client.chatStream({
        model: "command-r-plus",
        messages: messages,
        tools: tools
    });

    let toolCalls: ToolCallV2[] = [];
    let currentToolCall: Partial<ToolCallV2> = {};

    for await (const event of stream) {
        switch (event.type) {
            case "message-start":
                console.log("\n[Message Start]");
                break;
                
            case "tool-call-start":
                console.log("\n[Tool Call Start]");
                currentToolCall = {
                    id: event.delta?.toolCall?.id,
                    type: "function",
                    function: {
                        name: event.delta?.toolCall?.function?.name
                    }
                };
                break;
                
            case "tool-call-delta":
                console.log("[Tool Call Delta]", event.delta?.toolCall?.function?.arguments);
                if (currentToolCall.function && event.delta?.toolCall?.function?.arguments) {
                    currentToolCall.function.arguments = 
                        (currentToolCall.function.arguments || "") + 
                        event.delta.toolCall.function.arguments;
                }
                break;
                
            case "tool-call-end":
                console.log("[Tool Call End]");
                if (currentToolCall.id) {
                    toolCalls.push(currentToolCall as ToolCallV2);
                }
                currentToolCall = {};
                break;
                
            case "message-end":
                console.log("\n[Message End]");
                
                // Process tool calls
                if (toolCalls.length > 0) {
                    console.log("\nExecuting streamed tool calls...");
                    
                    const toolResults: ChatMessageV2[] = [];
                    
                    for (const toolCall of toolCalls) {
                        const functionName = toolCall.function?.name;
                        const args = toolCall.function?.arguments;
                        
                        if (functionName && args) {
                            const parsedArgs = JSON.parse(args);
                            const result = toolImplementations[functionName as keyof typeof toolImplementations](parsedArgs);
                            
                            console.log(`\n${functionName}: ${JSON.stringify(result)}`);
                            
                            toolResults.push({
                                role: "tool",
                                toolCallId: toolCall.id!,
                                content: JSON.stringify(result)
                            });
                        }
                    }
                    
                    // Get final response with tool results
                    console.log("\nGetting final response with tool results...");
                    
                    const finalMessages: ChatMessageV2[] = [
                        ...messages,
                        {
                            role: "assistant",
                            content: "",
                            toolCalls: toolCalls
                        },
                        ...toolResults
                    ];
                    
                    const finalResponse = await client.chat({
                        model: "command-r-plus",
                        messages: finalMessages,
                        tools: tools
                    });
                    
                    console.log("\nFinal response:");
                    console.log(finalResponse.message?.content?.[0]?.text);
                }
                break;
        }
    }
}

// Run the examples
async function main() {
    try {
        await runToolExample();
        await runStreamingToolExample();
    } catch (error) {
        console.error("Error:", error);
    }
}

// Only run if this file is executed directly
if (require.main === module) {
    main();
}