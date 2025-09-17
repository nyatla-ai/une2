/* qam_image_generator.js
 * Refactor of the original drawing logic into a class.
 * The class preserves the same behavior as qam_symbol_trajectory_drawer_auto_width_padding_no_wrap (2).html:
 * - Fixed canvas height (H_FIXED=256)
 * - Auto width based on min/max X span (with shift) + PAD (constellation units) + PIXEL_MARGIN
 * - Grid layout N×N; symbols numbered 1..N*N mapping to row/col (row-major)
 * - Quadratic curve smoothing between points
 * - DPR-aware canvas scaling
 */
(function (global) {
  class QAMImageGenerator {
    /**
     * @param {HTMLCanvasElement} canvas
     * @param {object} [options]
     *  options = {
     *    N: 4,                 // grid size (N×N)
     *    PAD: 2,               // padding in constellation units (each side)
     *    shift: 1.0,           // shift (symbol units) applied progressively: s = ((i+1)/4)*shift
     *    lineWidth: 2,
     *    lineColor: "#00e5ff",
     *    H_FIXED: 256,         // fixed height (px)
     *    PIXEL_MARGIN: 24,     // outer pixel margin
     *  }
     */
    constructor(canvas, options = {}) {
      if (!canvas) throw new Error("canvas is required");
      this.canvas = canvas;
      this.ctx = canvas.getContext("2d");
      this.options = Object.assign(
        {
          N: 4,
          PAD: 2,
          shift: 1.0,
          lineWidth: 2,
          lineColor: "#00e5ff",
          H_FIXED: 256,
          PIXEL_MARGIN: 24,
        },
        options || {}
      );
      this.state = {
        width: 256,
        height: this.options.H_FIXED,
      };
      this._syncDPR();
    }

    /** Call if you expect DPR changes (e.g., when moving between screens) */
    _syncDPR() {
      this.dpr = Math.max(1, global.devicePixelRatio || 1);
    }

    /** Clamp helper */
    _clamp(v, a, b) {
      return Math.min(Math.max(v, a), b);
    }

    /** Map symbol number (1..N*N) to row/col in an N×N grid */
    _rc(n) {
      const N = this.options.N;
      const z = n - 1 | 0;
      return { row: Math.floor(z / N), col: z % N };
    }

    /** Compute span in X (symbol units) taking shift into account */
    _spanX(seq) {
      if (!seq || seq.length === 0) return { min: 0.5, max: 0.5 };
      let minX = Infinity, maxX = -Infinity;
      for (let i = 0; i < seq.length; i++) {
        const { col } = this._rc(seq[i]);
        const s = ((i + 1) / 4) * this.options.shift;
        const x = (col + 0.5) + s;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
      return { min: minX, max: maxX };
    }

    /** Decide canvas size (auto width, fixed height) based on sequence */
    _chooseCanvasSize(seq) {
      const { H_FIXED, PAD, PIXEL_MARGIN, N } = this.options;
      const H = H_FIXED;
      const step = (H - 2 * PIXEL_MARGIN) / (N + PAD * 2); // Y axis scale in px per constellation unit
      const sp = this._spanX(seq);
      const symSpanX = Math.max(1e-6, (sp.max - sp.min) + PAD * 2); // add left/right PAD (constellation units)
      const W = 2 * PIXEL_MARGIN + step * symSpanX;
      this.state.width = Math.ceil(W);
      this.state.height = H;
    }

    /** Apply canvas pixel size and DPR transform */
    _setupCanvas() {
      const { width, height } = this.state;
      const { canvas } = this;
      this._syncDPR();

      canvas.style.width = width + "px";
      canvas.style.height = height + "px";
      canvas.width = Math.floor(width * this.dpr);
      canvas.height = Math.floor(height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /** Draw the polyline with quadratic smoothing */
    _drawPolyline(seq) {
      const { ctx } = this;
      const { lineColor, lineWidth, N, PAD, PIXEL_MARGIN } = this.options;

      const step = (this.state.height - 2 * PIXEL_MARGIN) / (N + PAD * 2);
      const sp = this._spanX(seq);

      ctx.clearRect(0, 0, this.state.width, this.state.height);
      ctx.fillStyle = "#0b0f1a";
      ctx.fillRect(0, 0, this.state.width, this.state.height);

      if (!seq || seq.length < 2) return;

      const pts = [];
      for (let i = 0; i < seq.length; i++) {
        const { row, col } = this._rc(seq[i]);
        const s = ((i + 1) / 4) * this.options.shift;
        const xSym = (col + 0.5) + s; // in constellation units
        const x = PIXEL_MARGIN + step * ((xSym - sp.min) + PAD);
        const y = PIXEL_MARGIN + step * (PAD + row + 0.5);
        pts.push({ x, y });
      }

      ctx.save();
      ctx.strokeStyle = lineColor;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 2; i++) {
        const xc = (pts[i].x + pts[i + 1].x) / 2;
        const yc = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc);
      }
      ctx.quadraticCurveTo(
        pts[pts.length - 2].x,
        pts[pts.length - 2].y,
        pts[pts.length - 1].x,
        pts[pts.length - 1].y
      );
      ctx.stroke();
      ctx.restore();
    }

    /**
     * Public: update options (any subset of constructor options)
     */
    setOptions(opts = {}) {
      Object.assign(this.options, opts || {});
    }

    /**
     * Public: resize and draw a given integer sequence (values 1..N*N)
     * @param {number[]} seq
     */
    render(seq) {
      this._chooseCanvasSize(seq);
      this._setupCanvas();
      this._drawPolyline(seq);
    }

    /** Public helpers for download */
    toDataURL(type = "image/png", quality = 0.92) {
      return this.canvas.toDataURL(type, quality);
    }

    toBlob() {
      return new Promise((resolve) => this.canvas.toBlob(resolve, "image/png"));
    }
  }

  global.QAMImageGenerator = QAMImageGenerator;
})(window);
