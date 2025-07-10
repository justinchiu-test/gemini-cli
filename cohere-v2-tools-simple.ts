import { CohereClientV2 } from "./cohere-typescript/dist/index.js";
import type { Cohere } from "./cohere-typescript/dist/index.js";

// Initialize client
const client = new CohereClientV2({
    token: process.env.COHERE_API_KEY!,
});

// Define a simple weather tool
const weatherTool: Cohere.ToolV2 = {
    type: "function",
    function: {
        name: "get_weather",
        description: "Get the current weather for a location",
        parameters: {
            type: "object",
            properties: {
                location: {
                    type: "string",
                    description: "The city name"
                }
            },
            required: ["location"]
        }
    }
};

async function main() {
    // Step 1: Ask about weather (this will trigger a tool call)
    console.log("User: What's the weather in Paris?");
    
    const response1 = await client.chat({
        model: "command-r-plus",
        messages: [{
            role: "user",
            content: "What's the weather in Paris?"
        }],
        tools: [weatherTool]
    });

    console.log("\nAssistant response:");
    console.log(JSON.stringify(response1, null, 2));

    // Check if there are tool calls
    if (!response1.message?.toolCalls || response1.message.toolCalls.length === 0) {
        console.log("No tool calls in response");
        return;
    }

    console.log("\nAssistant wants to call tool:");
    console.log(JSON.stringify(response1.message.toolCalls, null, 2));

    // Step 2: Execute the tool (mock implementation)
    const toolCall = response1.message.toolCalls[0];
    const args = JSON.parse(toolCall.function!.arguments!);
    
    const weatherData = {
        location: args.location,
        temperature: "18°C",
        conditions: "Partly cloudy"
    };

    // Step 3: Send tool result back
    const messages: Cohere.ChatMessageV2[] = [
        {
            role: "user",
            content: "What's the weather in Paris?"
        },
        {
            role: "assistant",
            content: "",
            toolCalls: response1.message.toolCalls
        },
        {
            role: "tool",
            toolCallId: toolCall.id!,
            content: JSON.stringify(weatherData)
        }
    ];

    const response2 = await client.chat({
        model: "command-r-plus",
        messages: messages,
        tools: [weatherTool]
    });

    console.log("\nAssistant final response:");
    console.log(response2.message?.content?.[0]?.text);
}

main().catch(console.error);