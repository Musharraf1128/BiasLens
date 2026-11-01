import { NextResponse } from "next/server";
import { z } from "zod";

import { listDemoStories, loadDemoStory } from "@/lib/analysis/demo";
import { runAnalysis } from "@/lib/analysis/pipeline";
import { AnalyzeResultSchema, type ActivityEvent } from "@/lib/analysis/types";
import { getLlmConfig, tinyfishConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const BodySchema = z.object({
  input: z.string().trim().min(3).max(500),
  storyId: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{0,60}$/)
    .optional(),
});

type Emit = (event: ActivityEvent | { type: "done"; result: unknown; at: string }) => void;

function eventStream(
  request: Request,
  run: (emit: Emit) => Promise<void>,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const emit: Emit = (event) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          );
        } catch {
          closed = true;
        }
      };

      request.signal.addEventListener("abort", () => {
        closed = true;
      });

      try {
        await run(emit);
      } catch (error) {
        emit({
          type: "error",
          at: new Date().toISOString(),
          message:
            error instanceof Error
              ? error.message.slice(0, 300)
              : "Analysis failed",
        });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Client already disconnected.
          }
        }
      }
    },
  });

  return new Response(body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function GET() {
  const llm = getLlmConfig();
  return NextResponse.json({
    tinyfish: tinyfishConfigured(),
    llm: { mode: llm.mode, model: llm.model, reason: llm.reason },
    stories: await listDemoStories(),
  });
}

export async function POST(request: Request) {
  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { input, storyId } = parsed.data;

  if (storyId) {
    const demo = await loadDemoStory(storyId);
    if (!demo) {
      return NextResponse.json({ error: "unknown_story" }, { status: 404 });
    }

    return eventStream(request, async (emit) => {
      for (const event of demo.result.activity) emit(event);
      emit({
        type: "done",
        at: new Date().toISOString(),
        result: {
          ...demo.result,
          mode: { ...demo.result.mode, replay: true, tinyfish: "cached" },
        },
      });
    });
  }

  if (!tinyfishConfigured()) {
    return eventStream(request, async (emit) => {
      emit({
        type: "error",
        at: new Date().toISOString(),
        message:
          "TINYFISH_API_KEY is not set. Add it to .env.local and restart the server, or replay a prepared story.",
      });
    });
  }

  return eventStream(request, async (emit) => {
    const activity: ActivityEvent[] = [];
    const result = await runAnalysis(input, (event) => {
      activity.push(event);
      emit(event);
    });
    const validated = AnalyzeResultSchema.safeParse({ ...result, activity });
    if (!validated.success) {
      throw new Error("Analysis produced an invalid result contract.");
    }
    emit({
      type: "done",
      at: new Date().toISOString(),
      result: validated.data,
    });
  });
}
