import { formatCoords, HexColor } from './seams';
import {
  buildWeftPlan,
  ColorEntry,
  FEEDER_NUMBERS,
  FeederConflict,
  findFeederConflicts,
  unassignedColors,
  WeftBlocker,
  WeftDraft,
  WEFT_FEEDER_COUNT,
} from './weft';

interface WeftPanelProps {
  blocker: WeftBlocker | null;
  entries: ColorEntry[];
  draft: WeftDraft;
  onAssign: (color: HexColor, feeder: number | undefined) => void;
}

function blockerText(blocker: WeftBlocker): string {
  switch (blocker.kind) {
    case 'empty':
      return `纹样尚有 ${blocker.empties} 处空格，填满全部色格后才能配台。`;
    case 'invalid':
      return `纹样存在 ${blocker.invalid} 处非法颜色，修正后才能配台。`;
    case 'too-many':
      return `纹样共使用 ${blocker.total} 种颜色，超过 ${WEFT_FEEDER_COUNT} 个送纬器的承载上限，请减少颜色后再配台。`;
  }
}

/**
 * 送纬器配台面板：负责配台草稿的编辑与反馈。
 * 草稿状态由 App 维护，这里只按纯函数结论渲染并回调修改。
 */
export function WeftPanel({ blocker, entries, draft, onAssign }: WeftPanelProps) {
  if (blocker) {
    return (
      <section className="panel" aria-labelledby="weft-title">
        <h2 id="weft-title">6. 送纬器配台</h2>
        <p className="weft-blocker" data-testid="weft-blocker">
          {blockerText(blocker)}
        </p>
      </section>
    );
  }

  const conflicts = findFeederConflicts(entries, draft);
  const conflictByColor = new Map<HexColor, FeederConflict>();
  for (const conflict of conflicts) {
    for (const color of conflict.colors) {
      conflictByColor.set(color, conflict);
    }
  }
  const pending = unassignedColors(entries, draft);
  const plan = buildWeftPlan(entries, draft);

  return (
    <section className="panel" aria-labelledby="weft-title">
      <h2 id="weft-title">6. 送纬器配台</h2>
      <p className="hint">
        按色值首次出现的行列顺序列出唯一颜色，为每种颜色选择 1–{WEFT_FEEDER_COUNT} 号送纬器；
        同一送纬器不能承载两种颜色。
      </p>
      <ul className="weft-list" data-testid="weft-list">
        {entries.map((entry) => {
          const feeder = draft[entry.color];
          const conflict = conflictByColor.get(entry.color);
          return (
            <li key={entry.color} className="weft-entry" data-testid="weft-entry" data-color={entry.color}>
              <span
                className="color-chip"
                style={{ backgroundColor: `#${entry.color}` }}
                data-testid="weft-swatch"
              >
                #{entry.color}
              </span>
              <span className="weft-meta">
                首用 {formatCoords(entry.first)} · {entry.count} 格
              </span>
              <label className="weft-select-label">
                送纬器
                <select
                  data-testid="weft-select"
                  data-color={entry.color}
                  value={feeder === undefined ? '' : String(feeder)}
                  aria-label={`为 #${entry.color} 选择送纬器`}
                  aria-invalid={conflict !== undefined}
                  onChange={(event) => {
                    const value = event.target.value;
                    onAssign(entry.color, value === '' ? undefined : Number(value));
                  }}
                >
                  <option value="">未分配</option>
                  {FEEDER_NUMBERS.map((n) => (
                    <option key={n} value={n}>
                      {n} 号
                    </option>
                  ))}
                </select>
              </label>
              {conflict && (
                <span className="weft-conflict" data-testid="weft-conflict" role="alert">
                  {conflict.feeder} 号送纬器重复占用：
                  {conflict.colors
                    .filter((color) => color !== entry.color)
                    .map((color) => `#${color}`)
                    .join('、')}
                  也在使用
                </span>
              )}
            </li>
          );
        })}
      </ul>

      {pending.length > 0 && (
        <p className="hint" data-testid="weft-pending">
          还有 {pending.length} 种颜色未分配送纬器，全部分配后才生成配台单。
        </p>
      )}

      {plan && (
        <div className="weft-plan" data-testid="weft-plan">
          <h3>配台单 · 上机顺序（按送纬器号）</h3>
          <ol>
            {plan.map((row) => (
              <li key={row.feeder} data-testid="weft-plan-row" data-feeder={row.feeder}>
                <span className="weft-plan-feeder">{row.feeder} 号送纬器</span>
                <span
                  className="color-chip"
                  style={{ backgroundColor: `#${row.color}` }}
                >
                  #{row.color}
                </span>
                <span className="weft-meta">{row.count} 格</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
