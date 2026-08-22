from pathlib import Path

CORE = Path('supabase/functions/trendyol-sync/index.ts')
AUX = Path('supabase/functions/trendyol-otherfinancials-sync/index.ts')


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


def patch_core() -> None:
    text = CORE.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'import { readJsonBody, requestError } from "../_shared/request-security.ts";\n',
        'import { readJsonBody, requestError } from "../_shared/request-security.ts";\nimport { resolveSyncRange } from "../_shared/sync-range.ts";\n',
        'core import',
    )
    text = replace_once(
        text,
        '''function rangeForDays(days: number) {\n  const p = dayFormatter.formatToParts(new Date()),\n    g = (t: string) => Number(p.find((x) => x.type === t)?.value),\n    today = Date.UTC(g("year"), g("month") - 1, g("day")) - 3 * 60 * 60 * 1000;\n  return { start: today - (days - 1) * DAY_MS, end: Date.now() };\n}\n''',
        '',
        'core relative range helper',
    )
    text = replace_once(
        text,
        '''  const connectionId = String(body?.connection_id || ""),\n    days = Number(body?.days || 30);\n  if (!validUuid(connectionId))\n    return json(400, { error: "INVALID_CONNECTION" }, origin);\n  if (![7, 30].includes(days))\n    return json(400, { error: "INVALID_RANGE" }, origin);\n''',
        '''  const connectionId = String(body?.connection_id || "");\n  const range = resolveSyncRange(body, { allowedDays: [7, 30], maxExplicitDays: 3 });\n  if (!validUuid(connectionId))\n    return json(400, { error: "INVALID_CONNECTION" }, origin);\n  if (!range)\n    return json(400, { error: "INVALID_RANGE" }, origin);\n''',
        'core body range parsing',
    )
    text = replace_once(
        text,
        '''  const lockToken = uuid(),\n    { start, end } = rangeForDays(days),\n    startDay = dayKey(start)!,\n    endDay = dayKey(end)!;\n''',
        '''  const lockToken = uuid(),\n    { start, end, startDay, endDay } = range;\n''',
        'core resolved range',
    )
    text = replace_once(text, '        rangeDays: days,\n', '        rangeDays: range.rangeDays,\n', 'core response range')
    if 'rangeForDays(' in text or 'rangeDays: days' in text:
        raise RuntimeError('core patch left obsolete range code')
    CORE.write_text(text, encoding='utf-8')


def patch_aux() -> None:
    text = AUX.read_text(encoding='utf-8')
    text = replace_once(
        text,
        'import { readJsonBody, requestError } from "../_shared/request-security.ts";\n',
        'import { readJsonBody, requestError } from "../_shared/request-security.ts";\nimport { resolveSyncRange } from "../_shared/sync-range.ts";\n',
        'aux import',
    )
    text = replace_once(
        text,
        '''function rangeForDays(days: number) {\n  const p = fmt.formatToParts(new Date()),\n    g = (t: string) => Number(p.find((x) => x.type === t)?.value),\n    today = Date.UTC(g("year"), g("month") - 1, g("day")) - 3 * 60 * 60 * 1000;\n  return { start: today - (days - 1) * DAY_MS, end: Date.now() };\n}\n''',
        '',
        'aux relative range helper',
    )
    text = replace_once(
        text,
        '''  const connectionId = String(body?.connection_id || ""),\n    days = Number(body?.days || 30);\n  if (!validUuid(connectionId))\n    return json(400, { error: "INVALID_CONNECTION" }, origin);\n  if (![7, 30].includes(days))\n    return json(400, { error: "INVALID_RANGE" }, origin);\n''',
        '''  const connectionId = String(body?.connection_id || "");\n  const range = resolveSyncRange(body, { allowedDays: [7, 30], maxExplicitDays: 3 });\n  if (!validUuid(connectionId))\n    return json(400, { error: "INVALID_CONNECTION" }, origin);\n  if (!range)\n    return json(400, { error: "INVALID_RANGE" }, origin);\n''',
        'aux body range parsing',
    )
    text = replace_once(
        text,
        '''  const lockToken = uuid(),\n    { start, end } = rangeForDays(days),\n    startDay = dayKey(start)!,\n    endDay = dayKey(end)!;\n''',
        '''  const lockToken = uuid(),\n    { start, end, startDay, endDay } = range;\n''',
        'aux resolved range',
    )
    text = replace_once(text, '        rangeDays: days,\n', '        rangeDays: range.rangeDays,\n', 'aux response range')
    text = replace_once(
        text,
        '        await tx`delete from public.marketplace_order_product_map where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid`;\n',
        '        await tx`delete from public.marketplace_order_product_map where connection_id=${connectionId}::uuid and user_id=${user.id}::uuid and order_day between ${startDay}::date and ${endDay}::date`;\n',
        'aux order map bounded cleanup',
    )
    if 'rangeForDays(' in text or 'rangeDays: days' in text:
        raise RuntimeError('aux patch left obsolete range code')
    AUX.write_text(text, encoding='utf-8')


patch_core()
patch_aux()
print('resumable provider range patch applied')
