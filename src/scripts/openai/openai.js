import { OpenAI } from "openai";
import { loadSchemaFile } from "../utils/schema-loader.js";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";
const MAX_TOKENS = process.env.MAX_TOKENS || 2000;

const client = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

export const createLineSpecificReviewAndSummary = async (fileContent) => {
  try {
    const schema = await loadSchemaFile("response.schema.json");
    const completions = await client.chat.completions.create({
      model: AI_MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "system",
          content: `You are a code reviewer assistant.`,
        },
        {
          role: "user",
          content: `
        You will review complete code step by step and will
        provide all possible issues, improvements, document for methods if missing and best practices as per below rules: 
        1. Provide the result object should be 
        {
            original_line: <original code line number>,
            original_code: <original code line>,
            suggested_change: <suggested code changes or code changes improvements>,
            explantions: <Brief explanation of the does the suggested code change does>
            document?: <document for method if it is missing otherwise give null>
        }
        2. Give all suggestions as per the format provided ONLY.
        3. Consider everything for actual code line number.
        Review the below code: 
        ${fileContent}
        `,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "review_response",
          schema: schema,
          strict: true,
        },
      },
    });
    console.log(completions);
    const completionText = completions.choices[0].message.content;
    console.log("completionText", completionText);
    const jsonResponse = JSON.parse(completionText);
    return jsonResponse;
  } catch (error) {
    console.error(error)
  }
};

createLineSpecificReviewAndSummary(`
  function foo(a, b) {
  return a+b;
  }
  `);
