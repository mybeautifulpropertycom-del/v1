import { platformAdmin, adminFailure } from "@/lib/platform-admin";
import {
  billingJson,
  BillingError,
  readLimitedBody,
  UUID,
} from "@/lib/stripe-server";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    const { user, admin } = await platformAdmin(request);
    let body;
    try {
      body = JSON.parse(await readLimitedBody(request, 1024));
    } catch {
      throw new BillingError("Choose an account or property.", 400);
    }
    if (
      !UUID.test(body?.id || "") ||
      !["account", "property"].includes(body?.kind)
    )
      throw new BillingError("Choose an account or property.", 400);
    if (body.kind === "account") {
      const { data: role, error } = await admin
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", body.id)
        .maybeSingle();
      if (error) throw error;
      if (body.id === user.id || role)
        throw new BillingError(
          "Administrator accounts cannot be deleted here.",
          409,
        );
    }
    const { data, error } = await admin.rpc(
      body.kind === "account"
        ? "admin_delete_account"
        : "admin_delete_property",
      { p_target: body.id, p_actor: user.id },
    );
    if (error?.code === "P0409")
      throw new BillingError(
        "A checkout is still active. Delete after it expires or the payment is confirmed.",
        409,
      );
    if (error)
      throw new BillingError(
        "Deletion could not be confirmed. Check the account lifecycle database update and try again.",
        503,
      );
    if (data !== true)
      throw new BillingError(
        "This account or property is no longer available.",
        404,
      );
    // A durable tombstone already blocks uploads/listing creation even if Auth
    // is temporarily unavailable. The scheduled worker retries suspension.
    if (body.kind === "account")
      await admin.auth.admin
        .updateUserById(body.id, { ban_duration: "876000h" })
        .catch(() => null);
    return billingJson({ deleted: body.kind === "property", queued: true });
  } catch (error) {
    return adminFailure(error);
  }
}
