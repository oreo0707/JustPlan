type FeedbackCategory = "general" | "bug" | "feature" | "design";

type FeedbackRequestBody = {
  category?: unknown;
  rating?: unknown;
  message?: unknown;
  page?: unknown;
};

const allowedCategories = new Set<FeedbackCategory>([
  "general",
  "bug",
  "feature",
  "design",
]);

function getText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function getCategory(value: unknown): FeedbackCategory {
  return typeof value === "string" &&
    allowedCategories.has(value as FeedbackCategory)
    ? (value as FeedbackCategory)
    : "general";
}

function getRating(value: unknown) {
  const rating = Number(value);

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return null;
  }

  return rating;
}

function buildWebhookText(feedback: {
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  page: string;
  createdAt: string;
}) {
  return [
    "New anonymous Just Plan feedback",
    `Category: ${feedback.category}`,
    `Rating: ${feedback.rating ?? "Not provided"}`,
    `Page: ${feedback.page || "Settings"}`,
    `Time: ${feedback.createdAt}`,
    "",
    feedback.message,
  ].join("\n");
}

async function sendToWebhook(feedback: {
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  page: string;
  createdAt: string;
}) {
  const webhookUrl = process.env.FEEDBACK_WEBHOOK_URL;

  if (!webhookUrl) {
    console.warn("FEEDBACK_WEBHOOK_URL is missing. Feedback was not delivered.");
    return { delivered: false, reason: "missing-webhook" };
  }

  const webhookText = buildWebhookText(feedback);
  const isDiscordWebhook =
    webhookUrl.includes("discord.com/api/webhooks") ||
    webhookUrl.includes("discordapp.com/api/webhooks");
  const isSlackWebhook = webhookUrl.includes("hooks.slack.com");

  const body = isDiscordWebhook
    ? { content: webhookText }
    : isSlackWebhook
      ? { text: webhookText }
      : {
          type: "just-plan-feedback",
          ...feedback,
        };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");

    throw new Error(
      `Feedback webhook request failed with ${response.status}. ${responseText}`
    );
  }

  return { delivered: true, reason: "webhook" };
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as FeedbackRequestBody;
    const message = getText(body.message);

    if (message.length < 5) {
      return Response.json(
        { error: "Please write a little more feedback before sending." },
        { status: 400 }
      );
    }

    if (message.length > 2000) {
      return Response.json(
        { error: "Feedback must be 2000 characters or fewer." },
        { status: 400 }
      );
    }

    const feedback = {
      category: getCategory(body.category),
      rating: getRating(body.rating),
      message,
      page: getText(body.page) || "Settings",
      createdAt: new Date().toISOString(),
    };

    const delivery = await sendToWebhook(feedback);

    if (!delivery.delivered) {
      return Response.json(
        {
          error:
            "Feedback webhook is not configured yet. Add FEEDBACK_WEBHOOK_URL in Vercel and redeploy.",
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, delivered: true });
  } catch (error) {
    console.error("Feedback submission failed:", error);

    return Response.json(
      { error: "Unable to send feedback right now. Please try again later." },
      { status: 500 }
    );
  }
}
