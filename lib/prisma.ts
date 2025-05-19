import { PrismaClient } from "@prisma/client";
import { cache } from "react";

// Use a single instance of Prisma Client in development
const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Check if we're in an edge runtime
const isEdgeRuntime = typeof globalThis.process === 'undefined' ||
  !globalThis.process.versions ||
  !globalThis.process.versions.node;

export const getPrisma = cache(() => {
  // Skip database operations in edge runtime
  if (isEdgeRuntime) {
    // Return a mock PrismaClient that doesn't throw errors
    return {
      chat: {
        create: async () => ({ id: 'mock-chat-id' }),
        findUnique: async (params: any) => {
          // Return a mock chat with messages if include.messages is true
          if (params?.include?.messages) {
            return {
              id: 'mock-chat-id',
              model: 'mock-model',
              quality: 'high',
              prompt: 'mock-prompt',
              title: 'Mock Chat',
              shadcn: true,
              messages: [
                { id: 'mock-message-1', role: 'system', content: 'Mock system message', position: 0 },
                { id: 'mock-message-2', role: 'user', content: 'Mock user message', position: 1 }
              ]
            };
          }
          return { id: 'mock-chat-id' };
        },
        update: async (params: any) => {
          // Return a mock chat with the updated data and messages
          return {
            id: 'mock-chat-id',
            ...params.data,
            messages: [
              { id: 'mock-system-message', role: 'system', content: params.data.messages?.createMany?.data[0]?.content || 'Mock system message', position: 0 },
              { id: 'mock-user-message', role: 'user', content: params.data.messages?.createMany?.data[1]?.content || 'Mock user message', position: 1 }
            ]
          };
        }
      },
      message: {
        create: async (params: any) => ({
          id: 'mock-message-id',
          ...params.data
        }),
        findMany: async () => [],
        createMany: async () => ({ count: 2 })
      },
      $connect: async () => {},
      $disconnect: async () => {},
    } as unknown as PrismaClient;
  }

  if (process.env.NODE_ENV === "production") {
    return new PrismaClient();
  }
  
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = new PrismaClient();
  }
  
  return globalForPrisma.prisma;
});
