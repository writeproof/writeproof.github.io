// Canvas-based 2D scatter plot renderer

const COLORS = [
  '#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#6366f1',
];

export function getSeriesColor(index) {
  return COLORS[index % COLORS.length];
}

export class ScatterChart {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.margin = { top: 20, right: 20, bottom: 50, left: 60 };
    this.series = [];
    this.xLabel = '';
    this.yLabel = '';
    this._resizeTimer = null;

    this._ro = new ResizeObserver(() => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => this.resize(), 100);
    });
    this._ro.observe(canvas.parentElement);
    this.resize();
  }

  setData(series) {
    this.series = series;
    this.render();
  }

  toggleSeries(id, visible) {
    const s = this.series.find((s) => s.id === id);
    if (s) {
      s.visible = visible;
      this.render();
    }
  }

  setAxes(xLabel, yLabel) {
    this.xLabel = xLabel;
    this.yLabel = yLabel;
    this.render();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const m = this.margin;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;

    ctx.clearRect(0, 0, w, h);

    const plotW = w - m.left - m.right;
    const plotH = h - m.top - m.bottom;
    if (plotW <= 0 || plotH <= 0) return;

    // Compute data bounds across visible series
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    let hasData = false;
    for (const s of this.series) {
      if (!s.visible || !s.x || !s.y) continue;
      for (let i = 0; i < s.x.length; i++) {
        const xv = s.x[i], yv = s.y[i];
        if (!isFinite(xv) || !isFinite(yv)) continue;
        if (xv < xMin) xMin = xv;
        if (xv > xMax) xMax = xv;
        if (yv < yMin) yMin = yv;
        if (yv > yMax) yMax = yv;
        hasData = true;
      }
    }

    if (!hasData) {
      xMin = 0; xMax = 1; yMin = 0; yMax = 1;
    }

    // Add padding so dots aren't right on the edge
    const xPad = (xMax - xMin) * 0.05 || 0.5;
    const yPad = (yMax - yMin) * 0.05 || 0.5;
    xMin -= xPad; xMax += xPad;
    yMin -= yPad; yMax += yPad;

    // Compute nice ticks
    const xTicks = niceTicks(xMin, xMax, 7);
    const yTicks = niceTicks(yMin, yMax, 7);

    // Use tick range as actual min/max
    xMin = xTicks[0];
    xMax = xTicks[xTicks.length - 1];
    yMin = yTicks[0];
    yMax = yTicks[yTicks.length - 1];

    const xRange = xMax - xMin || 1;
    const yRange = yMax - yMin || 1;

    function toX(v) { return m.left + ((v - xMin) / xRange) * plotW; }
    function toY(v) { return m.top + plotH - ((v - yMin) / yRange) * plotH; }

    // Grid lines
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    for (const t of xTicks) {
      const x = Math.round(toX(t)) + 0.5;
      ctx.moveTo(x, m.top);
      ctx.lineTo(x, m.top + plotH);
    }
    for (const t of yTicks) {
      const y = Math.round(toY(t)) + 0.5;
      ctx.moveTo(m.left, y);
      ctx.lineTo(m.left + plotW, y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    // Axes
    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(m.left, m.top);
    ctx.lineTo(m.left, m.top + plotH);
    ctx.lineTo(m.left + plotW, m.top + plotH);
    ctx.stroke();

    // Tick labels
    ctx.fillStyle = '#6b7280';
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const t of xTicks) {
      ctx.fillText(formatTick(t), toX(t), m.top + plotH + 6);
    }

    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (const t of yTicks) {
      ctx.fillText(formatTick(t), m.left - 6, toY(t));
    }

    // Axis labels
    ctx.fillStyle = '#374151';
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.xLabel, m.left + plotW / 2, h - 14);

    ctx.save();
    ctx.translate(14, m.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(this.yLabel, 0, 0);
    ctx.restore();

    // Plot dots — clip to plot area
    ctx.save();
    ctx.beginPath();
    ctx.rect(m.left, m.top, plotW, plotH);
    ctx.clip();

    ctx.globalAlpha = 0.4;
    for (const s of this.series) {
      if (!s.visible || !s.x || !s.y) continue;
      ctx.fillStyle = s.color;
      ctx.beginPath();
      for (let i = 0; i < s.x.length; i++) {
        const xv = s.x[i], yv = s.y[i];
        if (!isFinite(xv) || !isFinite(yv)) continue;
        const px = toX(xv);
        const py = toY(yv);
        ctx.moveTo(px + 2, py);
        ctx.arc(px, py, 2, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  destroy() {
    this._ro.disconnect();
    clearTimeout(this._resizeTimer);
  }
}

/**
 * Compute "nice" tick values for an axis range.
 */
function niceTicks(lo, hi, targetCount) {
  if (!isFinite(lo) || !isFinite(hi) || lo >= hi) {
    lo = 0; hi = 1;
  }
  const range = hi - lo;
  const rough = range / Math.max(targetCount - 1, 1);
  const mag = Math.pow(10, Math.floor(Math.log10(rough)));
  const residual = rough / mag;

  let step;
  if (residual <= 1.5) step = 1 * mag;
  else if (residual <= 3.5) step = 2 * mag;
  else if (residual <= 7.5) step = 5 * mag;
  else step = 10 * mag;

  const start = Math.floor(lo / step) * step;
  const ticks = [];
  for (let v = start; v <= hi + step * 0.5; v += step) {
    ticks.push(roundFloat(v, step));
  }
  return ticks.length >= 2 ? ticks : [lo, hi];
}

function roundFloat(v, step) {
  const decimals = Math.max(0, -Math.floor(Math.log10(step)) + 1);
  return parseFloat(v.toFixed(decimals));
}

function formatTick(v) {
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'M';
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(1) + 'k';
  if (Number.isInteger(v)) return v.toString();
  return v.toPrecision(3);
}
