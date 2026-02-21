import { openai } from "@ai-sdk/openai";
import { streamText, tool, stepCountIs, convertToModelMessages } from "ai";
import { z } from "zod";
import { generateFromChat } from "@/lib/chat/generate-from-chat";
import { SYSTEM_PROMPT } from "@/lib/chat/system-prompt";

export const maxDuration = 120;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(5),
    tools: {
      present_options: tool({
        description:
          "Present clickable options to the user. Call this EVERY TIME you ask the user to choose between options. The options will be displayed as interactive cards above the chat input.",
        inputSchema: z.object({
          question: z
            .string()
            .describe("The question being asked"),
          options: z
            .array(
              z.object({
                label: z.string().describe("Display label for the option"),
                description: z
                  .string()
                  .optional()
                  .describe("Brief description of this option"),
              })
            )
            .min(2)
            .max(10)
            .describe("The options to present as clickable cards"),
          allowCustom: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to show a 'Something else' free-text input"),
          allowSkip: z
            .boolean()
            .optional()
            .default(true)
            .describe("Whether to show a 'Skip' button"),
        }),
        // No execute — this is a client-side presentational tool
      }),
      update_photo_options: tool({
        description:
          "Update the user's photo options based on their answers. Call this EVERY TIME the user provides a preference for any option (image type, occasion, discount text, aspect ratio, number of images, or additional details). You can update one or several options at a time.",
        inputSchema: z.object({
          imageType: z
            .enum(["product-alone", "in-use"])
            .optional()
            .describe(
              "Whether to show product alone or in lifestyle context"
            ),
          occasion: z
            .enum([
              "christmas",
              "black-friday",
              "valentines-day",
              "halloween",
              "new-year",
              "mothers-day",
              "fathers-day",
              "easter",
              "summer-sale",
              "back-to-school",
              "none",
            ])
            .optional()
            .describe(
              "Seasonal occasion theme, or 'none' for no specific occasion"
            ),
          discountText: z
            .string()
            .optional()
            .describe('Discount/promo text, e.g. "50% OFF"'),
          aspectRatio: z
            .enum(["1:1", "4:3", "3:4", "16:9", "9:16"])
            .optional()
            .describe("Image aspect ratio"),
          numImages: z
            .number()
            .min(1)
            .max(4)
            .optional()
            .describe("Number of image variations to generate"),
          additionalDetails: z
            .string()
            .optional()
            .describe("Any extra creative/styling instructions"),
        }),
        execute: async (params) => {
          return { success: true, updatedOptions: params };
        },
      }),
      generate_product_image: tool({
        description:
          "Generate AI product photography. Only call this AFTER you have asked the user about all options (image type, occasion, brand, promo text, aspect ratio, number of images) and they have confirmed.",
        inputSchema: z.object({
          imageUrls: z
            .array(z.string())
            .min(1)
            .describe("URLs of the product images uploaded by the user"),
          imageType: z
            .enum(["product-alone", "in-use"])
            .describe(
              "Whether to show product alone or in lifestyle context"
            ),
          occasion: z
            .enum([
              "christmas",
              "black-friday",
              "valentines-day",
              "halloween",
              "new-year",
              "mothers-day",
              "fathers-day",
              "easter",
              "summer-sale",
              "back-to-school",
            ])
            .optional()
            .describe("Seasonal occasion theme"),
          discountText: z
            .string()
            .optional()
            .describe('Discount text to overlay, e.g. "50% OFF"'),
          brandName: z.string().optional().describe("Brand name"),
          brandStyle: z
            .enum([
              "minimalist",
              "bold",
              "elegant",
              "playful",
              "corporate",
              "organic",
            ])
            .optional()
            .describe("Visual style"),
          brandColors: z
            .object({
              primary: z.string().optional(),
              secondary: z.string().optional(),
              accent: z.string().optional(),
            })
            .optional()
            .describe("Brand color palette"),
          additionalDetails: z
            .string()
            .optional()
            .describe("Any extra styling instructions"),
          aspectRatio: z
            .enum(["1:1", "4:3", "3:4", "16:9", "9:16"])
            .optional()
            .default("1:1"),
          numImages: z.number().min(1).max(4).optional().default(1),
        }),
        execute: async (params) => {
          try {
            return await generateFromChat(params);
          } catch (error) {
            console.error("Chat generation error:", error);
            return {
              success: false,
              error:
                error instanceof Error
                  ? error.message
                  : "Generation failed",
            };
          }
        },
      }),
    },
  });

  return result.toUIMessageStreamResponse({
    headers: {
      "Transfer-Encoding": "chunked",
      Connection: "keep-alive",
    },
  });
}
