import { ResponseFormatJSONSchema } from "openai/resources";

export const JSON_SCHEMA: ResponseFormatJSONSchema.JSONSchema = {
  name: "review_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      changes: {
        type: "array",
        description: "A list of issues identified in the code review.",
        items: {
          type: "object",
          properties: {
            original_line: {
              type: "number",
              description: "The line number where the issue was found.",
            },
            original_code: {
              type: "string",
              description:
                "The code at the identified line that requires review or change.",
            },
            suggested_change: {
              type: "string",
              description:
                "The proposed modification to address the issues, improvements.",
            },
            explantions: {
              type: "string",
              description: "An explanation of why the change is suggested.",
            },
            document: {
              type: "string",
              description:
                "The document method with description, params, and return, or null if not required.",
            },
            type: {
              type: "string",
              enum: ["issue", "suggestion", "document"],
              description:
                "The type of change being made: 'issue', 'suggestion', or 'document'.",
            },
          },
          required: [
            "original_line",
            "original_code",
            "suggested_change",
            "explantions",
            "document",
            "type",
          ],
          additionalProperties: false,
        },
      },
      summarized_code: {
        type: "string",
        description: "A brief summary of the code being reviewed.",
      },
    },
    required: ["changes", "summarized_code"],
    additionalProperties: false,
  },
};
