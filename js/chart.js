/**
 * Charts — small dependency-free canvas 2D drawing helpers.
 * No charting library; these are purpose-built for exactly the two
 * visualizations this dashboard needs.
 */
const FirewallXCharts = (() => {
  const COLORS = {
    signal: "#4fd8e8",
    allow: "#5eeaa0",
    sandbox: "#f2b84b",
    block: "#ff5c72",
    line: "#232c3a",
    muted: "#6b7889",
  };

  function fitCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null; // canvas 2D unavailable — caller should skip drawing
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, width: rect.width, height: rect.height };
  }

  /**
   * Draw a line trace of anomaly scores (0..1), coloring each point by the
   * decision that was made on it (or muted signal color if none yet).
   * points: [{ anomaly: number, decision: 'allow'|'block'|'sandbox'|null, traffic: 'attack'|'normal' }]
   */
  function drawTrace(canvas, points) {
    const fitted = fitCanvas(canvas);
    if (!fitted) return;
    const { ctx, width, height } = fitted;
    ctx.clearRect(0, 0, width, height);

    const padX = 10;
    const padY = 16;
    const plotW = width - padX * 2;
    const plotH = height - padY * 2;

    // gridlines at 0.25 / 0.5 / 0.75
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1;
    [0.25, 0.5, 0.75].forEach((f) => {
      const y = padY + plotH * (1 - f);
      ctx.beginPath();
      ctx.moveTo(padX, y);
      ctx.lineTo(width - padX, y);
      ctx.stroke();
    });

    if (points.length === 0) {
      ctx.fillStyle = COLORS.muted;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText("no data yet — run a prediction", padX, height / 2);
      return;
    }

    const n = points.length;
    const stepX = n > 1 ? plotW / (n - 1) : 0;
    const xAt = (i) => padX + stepX * i;
    const yAt = (v) => padY + plotH * (1 - v);

    // connecting line
    ctx.beginPath();
    ctx.strokeStyle = COLORS.signal;
    ctx.lineWidth = 1.5;
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(p.anomaly);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // points, colored by decision
    points.forEach((p, i) => {
      const x = xAt(i);
      const y = yAt(p.anomaly);
      const color = p.decision ? COLORS[p.decision] : COLORS.muted;
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.arc(x, y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  /**
   * Draw a horizontal bar chart of decision counts (allow/block/sandbox).
   * counts: { allow: number, block: number, sandbox: number }
   */
  function drawDecisionBars(canvas, counts) {
    const fitted = fitCanvas(canvas);
    if (!fitted) return;
    const { ctx, width, height } = fitted;
    ctx.clearRect(0, 0, width, height);

    const entries = [
      ["allow", counts.allow, COLORS.allow],
      ["sandbox", counts.sandbox, COLORS.sandbox],
      ["block", counts.block, COLORS.block],
    ];
    const total = Math.max(1, counts.allow + counts.sandbox + counts.block);

    const padX = 70;
    const padY = 10;
    const rowH = (height - padY * 2) / entries.length;
    const barMaxW = width - padX - 50;

    ctx.font = "11px 'IBM Plex Mono', monospace";
    ctx.textBaseline = "middle";

    entries.forEach(([label, count, color], i) => {
      const y = padY + rowH * i + rowH / 2;
      const barH = Math.min(18, rowH * 0.5);
      const frac = count / total;
      const barW = Math.max(2, barMaxW * frac);

      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = "right";
      ctx.fillText(label, padX - 12, y);

      ctx.fillStyle = COLORS.line;
      ctx.fillRect(padX, y - barH / 2, barMaxW, barH);

      ctx.fillStyle = color;
      ctx.fillRect(padX, y - barH / 2, barW, barH);

      ctx.fillStyle = "#e8edf2";
      ctx.textAlign = "left";
      ctx.fillText(String(count), padX + barMaxW + 10, y);
    });
  }

  return { drawTrace, drawDecisionBars };
})();
