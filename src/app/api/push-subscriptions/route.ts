import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuthorizedSession } from "@/auth";
import { config } from "@/lib/config";
import { HTTP_STATUS, VALIDATION_LIMITS } from "@/lib/domain-constants";
import { removePushSubscription, savePushSubscription } from "@/lib/push-subscriptions";
import { getUserOwnerKey } from "@/lib/user-identity";

const endpoint = z.string().url().max(VALIDATION_LIMITS.PUSH_ENDPOINT_LENGTH).refine((value) => value.startsWith("https://"), "HTTPS endpoint required");
const subscriptionSchema = z.object({
  endpoint,
  expirationTime: z.number().int().positive().nullable(),
  keys: z.object({
    p256dh: z.string().min(VALIDATION_LIMITS.PUSH_PUBLIC_KEY_MIN_LENGTH).max(VALIDATION_LIMITS.PUSH_PUBLIC_KEY_MAX_LENGTH),
    auth: z.string().min(VALIDATION_LIMITS.PUSH_AUTH_MIN_LENGTH).max(VALIDATION_LIMITS.PUSH_AUTH_MAX_LENGTH),
  }).strict(),
}).strict();
const removalSchema = z.object({ endpoint }).strict();

export async function POST(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: HTTP_STATUS.NOT_FOUND });
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const parsed = subscriptionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription" }, { status: HTTP_STATUS.BAD_REQUEST });
  try {
    await savePushSubscription(getUserOwnerKey(session), parsed.data);
    return new NextResponse(null, { status: HTTP_STATUS.NO_CONTENT });
  } catch (error) {
    console.error("Unable to save Web Push subscription", error);
    return NextResponse.json({ error: "Unable to enable live updates" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}

export async function DELETE(request: Request) {
  if (config.isLocal) return NextResponse.json({ error: "Not found" }, { status: HTTP_STATUS.NOT_FOUND });
  const session = await getAuthorizedSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: HTTP_STATUS.UNAUTHORIZED });
  const parsed = removalSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid push subscription" }, { status: HTTP_STATUS.BAD_REQUEST });
  try {
    await removePushSubscription(getUserOwnerKey(session), parsed.data.endpoint);
    return new NextResponse(null, { status: HTTP_STATUS.NO_CONTENT });
  } catch (error) {
    console.error("Unable to remove Web Push subscription", error);
    return NextResponse.json({ error: "Unable to disable live updates" }, { status: HTTP_STATUS.BAD_GATEWAY });
  }
}
