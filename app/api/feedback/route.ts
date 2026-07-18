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

function truncateText(value: string, maxLength: number) {
  return value.length > maxLength
    ? `${value.slice(0, Math.max(0, maxLength - 1))}…`
    : value;
}

function buildDiscordWebhookBody(feedback: {
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  page: string;
  createdAt: string;
}) {
  return {
    username: "Just Plan Feedback",
    allowed_mentions: { parse: [] },
    embeds: [
      {
        title: "New anonymous Just Plan feedback",
        color: 5814783,
        description: truncateText(feedback.message, 4000),
        fields: [
          {
            name: "Category",
            value: feedback.category,
            inline: true,
          },
          {
            name: "Rating",
            value: String(feedback.rating ?? "Not provided"),
            inline: true,
          },
          {
            name: "Page",
            value: truncateText(feedback.page || "Settings", 256),
            inline: true,
          },
        ],
        timestamp: feedback.createdAt,
      },
    ],
  };
}

async function sendToWebhook(feedback: {
  category: FeedbackCategory;
  rating: number | null;
  message: string;
  page: string;
  createdAt: string;
}) {
  const webhookUrl = (
    process.env.FEEDBACK_WEBHOOK_URL ||
    process.env.DISCORD_WEBHOOK_URL ||
    ""
  ).trim();

  if (!webhookUrl) {
    console.warn(
      "Feedback webhook URL is missing. Set FEEDBACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL."
    );
    return { delivered: false, reason: "missing-webhook" };
  }

  const webhookText = buildWebhookText(feedback);
  const isDiscordWebhook =
    webhookUrl.includes("discord.com/api/webhooks") ||
    webhookUrl.includes("discordapp.com/api/webhooks");
  const isSlackWebhook = webhookUrl.includes("hooks.slack.com");

  const body = isDiscordWebhook
    ? buildDiscordWebhookBody(feedback)
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
      `Feedback webhook request failed with ${response.status}. ${truncateText(
        responseText,
        300
      )}`
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
            "Feedback webhook is not configured yet. Add FEEDBACK_WEBHOOK_URL or DISCORD_WEBHOOK_URL in Vercel and redeploy.",
        },
        { status: 500 }
      );
    }

    return Response.json({ ok: true, delivered: true });
  } catch (error) {
    console.error("Feedback submission failed:", error);

    if (
      error instanceof Error &&
      error.message.startsWith("Feedback webhook request failed")
    ) {
      return Response.json(
        {
          error:
            "Discord rejected the feedback webhook request. Please check that the webhook URL is active and belongs to the correct channel.",
          detail: error.message,
        },
        { status: 502 }
      );
    }

    return Response.json(
      { error: "Unable to send feedback right now. Please try again later." },
      { status: 500 }
    );
  }
}
