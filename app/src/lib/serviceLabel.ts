// Shared visual formatting for service references/titles with return ("retorno") numbering.
// IMPORTANT: visual-only. Never mutates DB or business logic.

const WARRANTY_REF_PATTERN = /\s*[-–—]\s*Em\s+Garantia/gi;
const RETORNO_REF_PATTERN = /\s*[-–—]?\s*Retorno\s+N[ºo°]?\s*\d+/gi;
const APPLIANCE_SPLIT = /\s+[—-]\s+/;
const APPLIANCE_WARRANTY = /^em\s+garantia$/i;
const APPLIANCE_RETORNO = /^retorno(\s+n[ºo°]?\s*\d+)?$/i;

export function cleanServiceReference(ref?: string | null): string {
  if (!ref) return "";
  return ref.replace(WARRANTY_REF_PATTERN, "").replace(RETORNO_REF_PATTERN, "").trim();
}

export function cleanApplianceType(appliance?: string | null): string {
  const raw = appliance || "";
  const parts = raw.split(APPLIANCE_SPLIT).map((p) => p.trim()).filter(Boolean);
  const cleaned = parts.filter(
    (p) => !APPLIANCE_WARRANTY.test(p) && !APPLIANCE_RETORNO.test(p),
  );
  return cleaned.join(" — ") || raw;
}

/** Count how many " - Em Garantia" suffixes accumulated in the raw reference. */
export function countWarrantySuffixes(ref?: string | null): number {
  if (!ref) return 0;
  return (ref.match(WARRANTY_REF_PATTERN) || []).length;
}

export interface ServiceLike {
  id?: string;
  reference?: string | null;
  appliance_type?: string | null;
  is_warranty?: boolean | null;
  parent_service_id?: string | null;
  scheduled_date?: string | null;
  created_at?: string | null;
}

/**
 * Build a return-sequence map (service.id -> Nº do retorno) from a list of services,
 * grouping by parent_service_id when available; otherwise by the cleaned reference.
 * This keeps legacy return records without parent_service_id sequenced together.
 */
export function buildReturnSequenceMap(
  services: ServiceLike[],
  returnVisits?: Array<{ service_request_id: string; sequence?: number | null }>,
): Map<string, number> {
  const map = new Map<string, number>();

  // Primary source: archived returns in service_return_visits.
  // The currently-active warranty on service_requests is always the NEXT
  // sequence after the archived ones.
  if (returnVisits && returnVisits.length >= 0) {
    const archivedCount = new Map<string, number>();
    for (const rv of returnVisits) {
      if (!rv?.service_request_id) continue;
      archivedCount.set(
        rv.service_request_id,
        (archivedCount.get(rv.service_request_id) || 0) + 1,
      );
    }
    for (const svc of services) {
      if (!svc?.is_warranty || !svc.id) continue;
      map.set(svc.id, (archivedCount.get(svc.id) || 0) + 1);
    }
    if (map.size > 0) return map;
  }

  // Legacy fallback: sibling services grouped by parent_service_id / reference.
  const grouped = new Map<string, ServiceLike[]>();
  for (const svc of services) {
    if (!svc?.is_warranty || !svc.id) continue;
    const cleanRef = cleanServiceReference(svc.reference).toUpperCase();
    const key = svc.parent_service_id || cleanRef || svc.id;
    const arr = grouped.get(key) || [];
    arr.push(svc);
    grouped.set(key, arr);
  }
  for (const [, group] of grouped) {
    group.sort((a, b) => {
      const aDate = `${a.scheduled_date || "9999-12-31"} ${a.created_at || ""}`;
      const bDate = `${b.scheduled_date || "9999-12-31"} ${b.created_at || ""}`;
      return aDate.localeCompare(bDate);
    });
    group.forEach((svc, idx) => svc.id && map.set(svc.id, idx + 1));
  }
  return map;
}

/**
 * Format the visual service label:  "WO123 Retorno Nº 2 — Lava-louças"  (when it's a return)
 * or                                  "WO123 — Lava-louças"               (normal).
 * Pass `sequence` when known (from buildReturnSequenceMap); otherwise it falls back to
 * counting the warranty suffixes accumulated in the raw reference.
 */
export function formatServiceLabel(
  svc: ServiceLike,
  options: { sequence?: number; includeAppliance?: boolean } = {},
): string {
  const includeAppliance = options.includeAppliance !== false;
  const rawRef = svc.reference || "";
  const cleanRef = cleanServiceReference(rawRef);
  const cleanApp = cleanApplianceType(svc.appliance_type);
  const warrantySuffixes = countWarrantySuffixes(rawRef);
  const applianceParts = (svc.appliance_type || "").split(APPLIANCE_SPLIT).map((p) => p.trim());
  const applianceHasReturnToken = applianceParts.some(
    (p) => APPLIANCE_WARRANTY.test(p) || APPLIANCE_RETORNO.test(p),
  );
  const isReturn = !!svc.is_warranty || warrantySuffixes > 0 || applianceHasReturnToken;

  if (isReturn) {
    const seq = options.sequence ?? (warrantySuffixes > 0 ? warrantySuffixes : 1);
    return includeAppliance
      ? `${cleanRef} Retorno Nº ${seq} — ${cleanApp}`
      : `${cleanRef} Retorno Nº ${seq}`;
  }
  return includeAppliance ? `${cleanRef} — ${cleanApp}` : cleanRef;
}

/** Returns just the formatted reference part ("WO123" or "WO123 Retorno Nº 2"). */
export function formatServiceReference(svc: ServiceLike, sequence?: number): string {
  return formatServiceLabel(svc, { sequence, includeAppliance: false });
}
