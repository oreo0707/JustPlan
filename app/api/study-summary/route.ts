import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

type StudySummaryRequestBody = {
  allowedSubjectNames?: string[];
  factualSummary?: string;
  activeStatistic?: string;
};

function buildStudyPrompt(body: StudySummaryRequestBody) {
  return `
You are the AI Study Coach for Just Plan, a cozy student planner app.

You must follow these rules strictly:
- Only use the facts provided in the factual summary.
- Only mention subject names from the allowed subject list.
- Do not invent subject names.
- Do not invent task names.
- Do not invent completion numbers.
- Do not mention "individual notes" unless the factual summary mentions notes.
- If there is not enough data, say there is not enough planned task data yet.

Allowed subject names:
${JSON.stringify(body.allowedSubjectNames ?? [], null, 2)}

Factual summary:
${body.factualSummary ?? ""}

The user is currently viewing:
${body.activeStatistic ?? "Statistics"}

Write a friendly study suggestion.

Response rules:
- Keep it under 120 words.
- Give advice related to the current selected statistic only.
- Mention exact subject names only if they appear in the allowed subject names.
- Give 2 practical next actions.
- Do not use markdown bold.
- Do not sound too formal.
`;
}

async function generateWithGemini(prompt: string) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is missing.");
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: prompt,
  });

  return response.text ?? "No Gemini response was generated.";
}

async function generateWithOllama(prompt: string) {
  const response = await fetch("http://localhost:11434/api/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gemma3:1b",
      prompt,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error("Ollama request failed.");
  }

  const result = await response.json();

  return result.response as string;
}

export async function POST(request: Request) {
  const body = await request.json();
  const prompt = buildStudyPrompt(body);

  try {
    const geminiSummary = await generateWithGemini(prompt);

    return Response.json({
      summary: geminiSummary,
      source: "gemini",
    });
  } catch (geminiError) {
    console.error("Gemini failed:", geminiError);

    try {
      const ollamaSummary = await generateWithOllama(prompt);

      return Response.json({
        summary: ollamaSummary,
        source: "ollama",
      });
    } catch (ollamaError) {
      console.error("Ollama failed:", ollamaError);

      return Response.json(
        {
          summary:
            "AI services are unavailable. A local study suggestion will be shown instead.",
          useFallback: true,
        },
        { status: 500 }
      );
    }
  }
}
