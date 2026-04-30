import { NextResponse } from "next/server";
import { requireAdminRole } from "@/lib/admin-auth";
import {
  fetchAgencySnapshots,
  getAgencyContext,
  describeAgencyError,
} from "@/lib/ghl/agency-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/snapshots
 *
 * Devuelve la lista de snapshots de la agencia para alimentar el dropdown
 * del form de "Crear proyecto" + el panel de snapshots. Si GHL rechaza el
 * call (típicamente 403 porque /snapshots/ no respeta el scope
 * `snapshots.readonly` desde un PIT), devolvemos `{ ok: false, hint }`
 * para que la UI muestre un input de texto libre como fallback.
 */
export async function GET() {
  const me = await requireAdminRole(["owner", "admin", "operator"]);
  if (!me.ok) {
    return NextResponse.json(
      { error: me.error, message: me.message },
      { status: me.status },
    );
  }

  const agency = await getAgencyContext();
  if (!agency.ok) {
    return NextResponse.json({
      ok: false,
      reason: "not_configured",
      missing: agency.missing,
      hint: "Cargá el PIT y el companyId en /admin/ajustes.",
    });
  }

  const result = await fetchAgencySnapshots(agency.ctx);
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      reason: result.reason,
      message: describeAgencyError(result),
      hint:
        "GHL no deja listar snapshots con un PIT (limitación documentada). Ingresá el snapshot ID manualmente.",
    });
  }

  return NextResponse.json({ ok: true, snapshots: result.data });
}
