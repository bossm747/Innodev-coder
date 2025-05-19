"use server";

import { getPrisma } from "@/lib/prisma";
import {
  getMainCodingPrompt,
  screenshotToCodePrompt,
  softwareArchitectPrompt,
} from "@/lib/prompts";
import { notFound } from "next/navigation";
import Together from "together-ai";

export async function createChat(
  prompt: string,
  model: string,
  quality: "high" | "low",
  screenshotUrl: string | undefined,
) {
  try {
    // Validate inputs
    if (!prompt) {
      throw new Error("Prompt is required");
    }
    if (!model) {
      throw new Error("Model is required");
    }
    if (quality !== "high" && quality !== "low") {
      throw new Error("Quality must be 'high' or 'low'");
    }

    // Initialize database connection
    const prisma = getPrisma();
    
    // Create initial chat record
    const chat = await prisma.chat.create({
      data: {
        model,
        quality,
        prompt,
        title: "",
        shadcn: true,
      },
    }).catch(error => {
      console.error("Failed to create chat:", error);
      throw new Error("Database error: Failed to create chat");
    });

    // Configure Together API client
    let options: ConstructorParameters<typeof Together>[0] = {
      apiKey: process.env.TOGETHER_API_KEY
    };
    
    if (!options.apiKey) {
      throw new Error("Together API key is not configured");
    }
    
    if (process.env.HELICONE_API_KEY) {
      options.baseURL = "https://together.helicone.ai/v1";
      options.defaultHeaders = {
        "Helicone-Auth": `Bearer ${process.env.HELICONE_API_KEY}`,
        "Helicone-Property-appname": "InnoDEV Coder by InnovatehubPH",
        "Helicone-Session-Id": chat.id,
        "Helicone-Session-Name": "InnoDEV Coder by InnovatehubPH Chat",
      };
    }

    const together = new Together(options);

    // Helper function to fetch chat title
    async function fetchTitle() {
      try {
        const responseForChatTitle = await together.chat.completions.create({
          model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          messages: [
            {
              role: "system",
              content:
                "You are a chatbot helping the user create a simple app or script, and your current job is to create a succinct title, maximum 3-5 words, for the chat given their initial prompt. Please return only the title.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });
        return responseForChatTitle.choices[0].message?.content || prompt;
      } catch (error) {
        console.error("Error fetching title:", error);
        return prompt.slice(0, 30) + (prompt.length > 30 ? "..." : ""); // Fallback title
      }
    }

    // Helper function to find similar example
    async function fetchTopExample() {
      try {
        const findSimilarExamples = await together.chat.completions.create({
          model: "meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo",
          messages: [
            {
              role: "system",
              content: `You are a helpful bot. Given a request for building an app, you match it to the most similar example provided. If the request is NOT similar to any of the provided examples, return "none". Here is the list of examples, ONLY reply with one of them OR "none":

              - landing page
              - blog app
              - quiz app
              - pomodoro timer
              `,
            },
            {
              role: "user",
              content: prompt,
            },
          ],
        });

        return findSimilarExamples.choices[0].message?.content || "none";
      } catch (error) {
        console.error("Error fetching top example:", error);
        return "none"; // Fallback
      }
    }

    // Fetch title and example in parallel
    const [title, mostSimilarExample] = await Promise.all([
      fetchTitle(),
      fetchTopExample(),
    ]);

    // Process screenshot if provided
    let fullScreenshotDescription;
    if (screenshotUrl) {
      try {
        const screenshotResponse = await together.chat.completions.create({
          model: "meta-llama/Llama-3.2-90B-Vision-Instruct-Turbo",
          temperature: 0.2,
          max_tokens: 1000,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: screenshotToCodePrompt },
                {
                  type: "image_url",
                  image_url: {
                    url: screenshotUrl,
                  },
                },
              ],
            },
          ],
        });

        fullScreenshotDescription = screenshotResponse.choices[0].message?.content;
      } catch (error) {
        console.error("Error processing screenshot:", error);
        // Continue without screenshot description
      }
    }

    // Prepare user message based on quality setting
    let userMessage: string;
    if (quality === "high") {
      try {
        let initialRes = await together.chat.completions.create({
          model: "Qwen/Qwen2.5-Coder-32B-Instruct",
          messages: [
            {
              role: "system",
              content: softwareArchitectPrompt,
            },
            {
              role: "user",
              content: fullScreenshotDescription
                ? fullScreenshotDescription + prompt
                : prompt,
            },
          ],
          temperature: 0.2,
          max_tokens: 3000,
        });

        userMessage = initialRes.choices[0].message?.content ?? prompt;
      } catch (error) {
        console.error("Error generating high-quality message:", error);
        userMessage = prompt; // Fallback to original prompt
      }
    } else if (fullScreenshotDescription) {
      userMessage =
        prompt +
        "RECREATE THIS APP AS CLOSELY AS POSSIBLE: " +
        fullScreenshotDescription;
    } else {
      userMessage = prompt;
    }

    // Update chat with messages
    let newChat = await prisma.chat.update({
      where: {
        id: chat.id,
      },
      data: {
        title,
        messages: {
          createMany: {
            data: [
              {
                role: "system",
                content: getMainCodingPrompt(mostSimilarExample),
                position: 0,
              },
              { role: "user", content: userMessage, position: 1 },
            ],
          },
        },
      },
      include: {
        messages: true,
      },
    }).catch(error => {
      console.error("Failed to update chat with messages:", error);
      throw new Error("Database error: Failed to update chat");
    });

    // Get the last message
    const lastMessage = newChat.messages
      .sort((a: any, b: any) => a.position - b.position)
      .at(-1);
      
    if (!lastMessage) {
      throw new Error("No new message created");
    }

    return {
      chatId: chat.id,
      lastMessageId: lastMessage.id,
    };
  } catch (error) {
    console.error("Error in createChat:", error);
    throw error; // Re-throw to be handled by the caller
  }
}

export async function createMessage(
  chatId: string,
  text: string,
  role: "assistant" | "user",
) {
  const prisma = getPrisma();
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: { messages: true },
  });
  if (!chat) notFound();

  const maxPosition = Math.max(...chat.messages.map((m: any) => m.position));

  const newMessage = await prisma.message.create({
    data: {
      role,
      content: text,
      position: maxPosition + 1,
      chatId,
    },
  });

  return newMessage;
}
