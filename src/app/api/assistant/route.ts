import { NextResponse } from "next/server";
import { answer, type AssistantRequest } from "@/lib/server/assistant";

export async function POST(req: Request) {
  const body: AssistantRequest = await req.json();
  return NextResponse.json(await answer(body));
}
