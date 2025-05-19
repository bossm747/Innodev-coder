import { PrismaClient } from "@prisma/client-edge"; // Use edge-specific client
import { PrismaNeon } from "@prisma/adapter-neon";
import { Pool } from "@neondatabase/serverless";
import { z } from "zod";
import Together from "together-ai";

export async function POST(req: Request) {
  try {
    // Validate request body
    if (!req.body) {
      return new Response(JSON.stringify({ error: "Request body is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Initialize Prisma client
    const prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });

    // Parse request body
    const { messageId, model } = await req.json();
    
    if (!messageId || !model) {
      return new Response(JSON.stringify({ error: "messageId and model are required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Find the message
    const message = await prisma.message.findUnique({
      where: { id: messageId },
    });

    if (!message) {
      return new Response(JSON.stringify({ error: "Message not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Get conversation history
    const messagesRes = await prisma.message.findMany({
      where: { chatId: message.chatId, position: { lte: message.position } },
      orderBy: { position: "asc" },
    });

    // Validate message format
    let messages;
    try {
      messages = z
        .array(
          z.object({
            role: z.enum(["system", "user", "assistant"]),
            content: z.string(),
          }),
        )
        .parse(messagesRes);
    } catch (error) {
      console.error("Message validation error:", error);
      return new Response(JSON.stringify({ error: "Invalid message format" }), {
        status: 400,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Limit context window if needed
    if (messages.length > 10) {
      messages = [messages[0], messages[1], messages[2], ...messages.slice(-7)];
    }

    // Configure Together API client
    let options: ConstructorParameters<typeof Together>[0] = {
      apiKey: process.env.TOGETHER_API_KEY
    };
    
    if (!options.apiKey) {
      return new Response(JSON.stringify({ error: "Together API key is not configured" }), {
        status: 500,
        headers: { "Content-Type": "application/json" }
      });
    }
    
    if (process.env.HELICONE_API_KEY) {
      options.baseURL = "https://together.helicone.ai/v1";
      options.defaultHeaders = {
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
        "Helicone-Property-appname": "InnoDEV Coder by InnovatehubPH",
        "Helicone-Session-Id": message.chatId,
        "Helicone-Session-Name": "InnoDEV Coder by InnovatehubPH Chat",
      };
    }

    const together = new Together(options);

    // Create completion stream
    const res = await together.chat.completions.create({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: true,
      temperature: 0.2,
      max_tokens: 9000,
    });

    // Return streaming response
    return new Response(res.toReadableStream(), {
      headers: {
        "Content-Type": "text/event-stream",
      },
    });
  } catch (error) {
    console.error("API route error:", error);
    return new Response(
      JSON.stringify({
        error: "An unexpected error occurred",
        details: error instanceof Error ? error.message : String(error)
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" }
      }
    );
  }
}

export const runtime = "edge";
export const maxDuration = 45;
