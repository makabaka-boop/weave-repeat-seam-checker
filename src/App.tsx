import { useEffect, useMemo, useState } from 'react';
import {
  Coords,
  Grid,
  HexColor,
  SeamMismatch,
  analyzeSeams,
  createEmptyGrid,
  formatCoords,
  hasDimensionErrors,
  normalizeHex,
  validateDimensions,
  validateGrid,
  MIN_SIZE,
  MAX_SIZE,
} from './seams';
import { extractColors, isDraftStale, WeftDraft, weftBlocker } from './weft';
import { DEFAULT_GRID } from './defaultPattern';
import { SeamCanvas } from './SeamCanvas';
import { WeftPanel } from './WeftPanel';

const PALETTE = [
  '1B3A5C',
  '4A90D9',
  'E8E8E8',
  'B91C1C',
  'F59E0B',
  '15803D',
  '7C3AED',
  '111827',
];

interface LocatedKey {
  axis: 'horizontal' | 'vertical';
  position: number;
}

interface CellMark {
  pairRefs: { axis: 'horizontal' | 'vertical'; index: number; position: number }[];
  located: boolean;
}

export default function App() {
  const [committedRows, setCommittedRows] = useState(DEFAULT_GRID.length);
  const [committedCols, setCommittedCols] = useState(DEFAULT_GRID[0].length);
  const [rowsInput, setRowsInput] = useState(String(DEFAULT_GRID.length));
  const [colsInput, setColsInput] = useState(String(DEFAULT_GRID[0].length));
  const [dimErrors, setDimErrors] = useState<{ rows?: string; cols?: string }>({});
  const [grid, setGrid] = useState<Grid>(() => DEFAULT_GRID.map((line) => [...line]));
  const [activeColor, setActiveColor] = useState<string>('B91C1C');
  const [customInput, setCustomInput] = useState('');
  const [customError, setCustomError] = useState<string | null>(null);
  const [located, setLocated] = useState<LocatedKey | null>(null);
  // 配台草稿：色值 -> 送纬器号。修改任一色格或应用新尺寸即整体清空。
  const [weftDraft, setWeftDraft] = useState<WeftDraft>({});

  // 逐格校验与判定：数据不完整时结论为 null，绝不产生部分判定。
  const { issues, valid } = useMemo(() => validateGrid(grid), [grid]);
  const result = useMemo(() => (valid ? analyzeSeams(grid) : null), [grid, valid]);

  // 配台区派生数据：唯一颜色（首次出现行列序）、阻断原因。
  const colorEntries = useMemo(() => extractColors(grid), [grid]);
  const blocker = useMemo(() => weftBlocker(grid), [grid]);
  // 防御：草稿引用了已消失的颜色（编辑/改尺寸）即视为空草稿。
  const effectiveDraft = useMemo(
    () => (isDraftStale(colorEntries, weftDraft) ? {} : weftDraft),
    [colorEntries, weftDraft],
  );
  // Canvas 角标用：可配台时把已分配的色值映射到送纬器号。
  const weftAssignments = useMemo(() => {
    const map = new Map<HexColor, number>();
    if (!blocker) {
      for (const entry of colorEntries) {
        const feeder = effectiveDraft[entry.color];
        if (feeder !== undefined) map.set(entry.color, feeder);
      }
    }
    return map;
  }, [blocker, colorEntries, effectiveDraft]);

  // 尺寸变化或编辑后，已定位项可能消失，清理失效定位。
  const locatedMismatch: SeamMismatch | null = useMemo(() => {
    if (!result || !located) return null;
    const list = located.axis === 'horizontal' ? result.horizontal.mismatches : result.vertical.mismatches;
    return list.find((pair) => pair.position === located.position) ?? null;
  }, [result, located]);

  useEffect(() => {
    if (located && !locatedMismatch) setLocated(null);
  }, [located, locatedMismatch]);

  // 每个色格的接缝归属（角格可同时属于水平、垂直两条接缝）。
  const cellMarks = useMemo(() => {
    const map = new Map<string, CellMark>();
    const mark = (coords: Coords, ref: CellMark['pairRefs'][number]) => {
      const key = `${coords.row}:${coords.col}`;
      const entry = map.get(key) ?? { pairRefs: [], located: false };
      entry.pairRefs.push(ref);
      map.set(key, entry);
    };
    if (result) {
      for (const dir of [result.horizontal, result.vertical]) {
        for (const pair of dir.mismatches) {
          const ref = { axis: pair.axis, index: pair.index, position: pair.position };
          mark(pair.a, ref);
          mark(pair.b, ref);
        }
      }
      if (locatedMismatch) {
        for (const coords of [locatedMismatch.a, locatedMismatch.b]) {
          const entry = map.get(`${coords.row}:${coords.col}`);
          if (entry) entry.located = true;
        }
      }
    }
    return map;
  }, [result, locatedMismatch]);

  const applyDimensions = () => {
    const errors = validateDimensions({ rowsInput, colsInput });
    setDimErrors(errors);
    if (hasDimensionErrors(errors)) return; // 只给字段级错误，旧网格与结论保持不动
    const rows = parseInt(rowsInput.trim(), 10);
    const cols = parseInt(colsInput.trim(), 10);
    if (rows !== committedRows || cols !== committedCols) {
      setCommittedRows(rows);
      setCommittedCols(cols);
      // 尺寸改变：旧网格、预览与结论立即失效，回到空网格。
      setGrid(createEmptyGrid(rows, cols));
      setLocated(null);
      setWeftDraft({});
    }
  };

  const paintCell = (row: number, col: number) => {
    setGrid((current) => {
      const next = current.map((line) => [...line]);
      next[row][col] = activeColor;
      return next;
    });
    // 任一色格变化：配台草稿与配台单立即失效。
    setWeftDraft({});
  };

  const clearCell = (row: number, col: number) => {
    setGrid((current) => {
      const next = current.map((line) => [...line]);
      next[row][col] = null;
      return next;
    });
    setWeftDraft({});
  };

  const assignFeeder = (color: HexColor, feeder: number | undefined) => {
    setWeftDraft((current) => {
      const next = { ...current };
      if (feeder === undefined) {
        delete next[color];
      } else {
        next[color] = feeder;
      }
      return next;
    });
  };

  const applyCustomColor = () => {
    const normalized = normalizeHex(customInput);
    if (!normalized) {
      setCustomError('颜色必须是六位十六进制，如 3A7CA5');
      return;
    }
    setCustomError(null);
    setActiveColor(normalized);
  };

  const emptyCount = issues.filter((issue) => issue.kind === 'empty').length;
  const invalidCount = issues.filter((issue) => issue.kind === 'invalid').length;

  return (
    <div className="workbench">
      <header>
        <h1>提花小样接缝校验台</h1>
        <p className="subtitle">
          三乘三循环铺展预览 · 逐行比对首末列、逐列比对首末行 · 颜色按六位大写十六进制比较
        </p>
      </header>

      <section className="panel" aria-labelledby="dim-title">
        <h2 id="dim-title">1. 纹样尺寸</h2>
        <div className="dim-row">
          <label>
            行数（{MIN_SIZE}–{MAX_SIZE}）
            <input
              data-testid="rows-input"
              value={rowsInput}
              inputMode="numeric"
              onChange={(event) => setRowsInput(event.target.value)}
              aria-invalid={dimErrors.rows !== undefined}
            />
          </label>
          <label>
            列数（{MIN_SIZE}–{MAX_SIZE}）
            <input
              data-testid="cols-input"
              value={colsInput}
              inputMode="numeric"
              onChange={(event) => setColsInput(event.target.value)}
              aria-invalid={dimErrors.cols !== undefined}
            />
          </label>
          <button type="button" data-testid="apply-dimensions" onClick={applyDimensions}>
            应用尺寸
          </button>
        </div>
        {dimErrors.rows && (
          <p className="field-error" data-testid="rows-error">
            {dimErrors.rows}
          </p>
        )}
        {dimErrors.cols && (
          <p className="field-error" data-testid="cols-error">
            {dimErrors.cols}
          </p>
        )}
        <p className="hint">应用新尺寸会清空当前纹样，旧预览与判定结论同时失效。</p>
      </section>

      <section className="panel" aria-labelledby="palette-title">
        <h2 id="palette-title">2. 调色板</h2>
        <div className="palette" data-testid="palette">
          {PALETTE.map((color) => (
            <button
              type="button"
              key={color}
              className={`swatch${activeColor === color ? ' active' : ''}`}
              style={{ backgroundColor: `#${color}` }}
              data-color={color}
              aria-label={`选择颜色 #${color}`}
              aria-pressed={activeColor === color}
              title={`#${color}`}
              onClick={() => {
                setActiveColor(color);
                setCustomError(null);
              }}
            />
          ))}
        </div>
        <div className="custom-color-row">
          <label>
            自定义色值
            <input
              data-testid="custom-hex"
              value={customInput}
              placeholder="如 3A7CA5"
              onChange={(event) => setCustomInput(event.target.value)}
              aria-invalid={customError !== null}
            />
          </label>
          <button type="button" data-testid="apply-custom-hex" onClick={applyCustomColor}>
            选用
          </button>
          <span className="current-color">
            当前画笔：
            <span
              className="color-chip"
              data-testid="active-color"
              style={{ backgroundColor: `#${activeColor}` }}
            >
              #{activeColor}
            </span>
          </span>
        </div>
        {customError && (
          <p className="field-error" data-testid="custom-error">
            {customError}
          </p>
        )}
      </section>

      <div className="two-columns">
        <section className="panel" aria-labelledby="editor-title">
          <h2 id="editor-title">3. 填满色格</h2>
          <p className="hint">左键涂色，右键清空。红色虚框为空格，角格同时参与两个方向的比较。</p>
          <div
            className="grid-editor"
            data-testid="grid-editor"
            style={{
              gridTemplateColumns: `repeat(${committedCols}, max-content)`,
            }}
          >
            {grid.map((line, row) =>
              line.map((cell, col) => {
                const mark = cellMarks.get(`${row}:${col}`);
                const isEmpty = cell === null;
                const classNames = [
                  'cell',
                  isEmpty ? 'cell-empty' : 'cell-filled',
                  mark ? 'cell-mismatch' : '',
                  mark?.located ? 'cell-located' : '',
                ]
                  .filter(Boolean)
                  .join(' ');
                return (
                  <button
                    type="button"
                    key={`${row}-${col}`}
                    className={classNames}
                    data-testid="cell"
                    data-row={row}
                    data-col={col}
                    data-empty={isEmpty}
                    data-mismatch={mark !== undefined}
                    data-located={mark?.located ?? false}
                    style={cell ? { backgroundColor: `#${cell}` } : undefined}
                    aria-label={`第${row + 1}行第${col + 1}列：${cell ? `#${cell}` : '空格'}`}
                    onClick={() => paintCell(row, col)}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      clearCell(row, col);
                    }}
                  >
                    {mark && mark.pairRefs.length > 0 && (
                      <span className="cell-badges">
                        {mark.pairRefs.map((ref) => (
                          <span
                            key={`${ref.axis}-${ref.position}`}
                            className={`badge badge-${ref.axis}`}
                          >
                            {ref.axis === 'horizontal' ? '横' : '纵'}
                            {ref.index + 1}
                          </span>
                        ))}
                      </span>
                    )}
                  </button>
                );
              }),
            )}
          </div>
        </section>

        <section className="panel" aria-labelledby="preview-title">
          <h2 id="preview-title">4. 三乘三循环铺展</h2>
          <SeamCanvas
            grid={grid}
            mismatches={[
              ...(result?.horizontal.mismatches ?? []),
              ...(result?.vertical.mismatches ?? []),
            ]}
            located={locatedMismatch ? { axis: locatedMismatch.axis, position: locatedMismatch.position } : null}
            weftAssignments={weftAssignments}
          />
        </section>
      </div>

      <section className="panel" aria-labelledby="report-title">
        <h2 id="report-title">5. 接缝判定</h2>
        {!valid && (
          <div className="conclusion" data-testid="conclusion" data-status="incomplete">
            <p data-testid="issue-summary">
              纹样未完成：共 {issues.length} 处逐格问题
              {emptyCount > 0 && `（空格 ${emptyCount} 处）`}
              {invalidCount > 0 && `（非法颜色 ${invalidCount} 处）`}
              。请填满全部色格后再判定，当前不产生任何接缝结论。
            </p>
            <ul className="issue-list" data-testid="issue-list">
              {issues.slice(0, 12).map((issue, i) => (
                <li key={`${issue.row}-${issue.col}-${i}`}>
                  {formatCoords({ row: issue.row, col: issue.col })}：
                  {issue.kind === 'empty' ? '空格' : '非法颜色'}
                </li>
              ))}
            </ul>
          </div>
        )}

        {valid && result && (
          <>
            <p
              className="conclusion"
              data-testid="conclusion"
              data-status={result.bothContinuous ? 'pass' : 'fail'}
            >
              {result.bothContinuous
                ? '两个方向均可连续铺展，投产无边界断纹。'
                : '存在不可连续铺展的接缝，下方按先行后列列出唯一位置，可逐格复核。'}
            </p>
            <div className="result-grid">
              <DirectionReport
                title="水平方向（首列 ↔ 末列，逐行比较）"
                direction={result.horizontal}
                located={locatedMismatch}
                onLocate={setLocated}
              />
              <DirectionReport
                title="垂直方向（首行 ↔ 末行，逐列比较）"
                direction={result.vertical}
                located={locatedMismatch}
                onLocate={setLocated}
              />
            </div>
          </>
        )}
      </section>

      <WeftPanel
        blocker={blocker}
        entries={colorEntries}
        draft={effectiveDraft}
        onAssign={assignFeeder}
      />
    </div>
  );
}

interface DirectionReportProps {
  title: string;
  direction: { axis: 'horizontal' | 'vertical'; continuous: boolean; mismatches: SeamMismatch[] };
  located: SeamMismatch | null;
  onLocate: (key: LocatedKey | null) => void;
}

function DirectionReport({ title, direction, located, onLocate }: DirectionReportProps) {
  return (
    <div className={`direction ${direction.continuous ? 'pass' : 'fail'}`} data-testid={`${direction.axis}-result`}>
      <h3>
        {title}
        <span className={`status-pill ${direction.continuous ? 'ok' : 'bad'}`}>
          {direction.continuous ? '可接' : '断纹'}
        </span>
      </h3>
      {direction.continuous ? (
        <p className="pass-text">全部{direction.axis === 'horizontal' ? '行' : '列'}首末色格相等，该方向可连续铺展。</p>
      ) : (
        <ul className="mismatch-list">
          {direction.mismatches.map((pair) => {
            const isLocated = located?.axis === pair.axis && located.position === pair.position;
            return (
              <li key={`${pair.axis}-${pair.position}`} className={isLocated ? 'located-row' : ''}>
                <span className="pair-index">#{pair.index + 1}</span>
                {direction.axis === 'horizontal'
                  ? `第 ${pair.position + 1} 行：`
                  : `第 ${pair.position + 1} 列：`}
                <span className="pair-coords">
                  {formatCoords(pair.a)} (#{pair.colorA}) ↔ {formatCoords(pair.b)} (#{pair.colorB})
                </span>
                <button
                  type="button"
                  className="locate-button"
                  data-testid={`locate-${pair.axis}-${pair.position}`}
                  aria-pressed={isLocated}
                  onClick={() =>
                    onLocate(isLocated ? null : { axis: pair.axis, position: pair.position })
                  }
                >
                  {isLocated ? '取消定位' : '在预览中定位'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
