/**
 * BugProof Terminal UI — Production-grade CLI output.
 *
 * Features:
 * - ASCII art logo for --help and first-run experience
 * - Terminal-width-aware section dividers
 * - Semantic color hierarchy (brand cyan, success green, warning yellow, error red)
 * - Branded spinner with elapsed time display
 * - Progress bar for long-running operations
 * - Table renderer for structured output
 * - Summary box for final results
 * - Status rows for doctor/health output
 * - NO_COLOR / isTTY aware
 */

const isColorSupported = process.stdout.isTTY && !process.env['NO_COLOR'];
const isTTY = process.stdout.isTTY;

function wrap(code: number, resetCode: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[${code}m${text}\x1b[${resetCode}m`;
}

export const c = {
  bold:     (t: string) => wrap(1, 22, t),
  dim:      (t: string) => wrap(2, 22, t),
  italic:   (t: string) => wrap(3, 23, t),
  underline:(t: string) => wrap(4, 24, t),
  red:      (t: string) => wrap(31, 39, t),
  green:    (t: string) => wrap(32, 39, t),
  yellow:   (t: string) => wrap(33, 39, t),
  blue:     (t: string) => wrap(34, 39, t),
  magenta:  (t: string) => wrap(35, 39, t),
  cyan:     (t: string) => wrap(36, 39, t),
  white:    (t: string) => wrap(37, 39, t),
  gray:     (t: string) => wrap(90, 39, t),
  bgCyan:   (t: string) => wrap(46, 49, t),
  bgRed:    (t: string) => wrap(41, 49, t),
  bgGreen:  (t: string) => wrap(42, 49, t),
};

export const icons = {
  check:    isColorSupported ? '\u2714' : '+',
  cross:    isColorSupported ? '\u2718' : 'x',
  warning:  isColorSupported ? '\u26A0' : '!',
  arrow:    isColorSupported ? '\u279C' : '>',
  bug:      isColorSupported ? '\uD83E\uDEB2' : '*',
  box:      isColorSupported ? '\u25A0' : '#',
  dot:      isColorSupported ? '\u2022' : '-',
  divider:  isColorSupported ? '\u2501' : '-',
  corner:   isColorSupported ? '\u251C' : '+',
  cornerEnd:isColorSupported ? '\u2514' : '+',
  line:     isColorSupported ? '\u2502' : '|',
  shield:   isColorSupported ? '\uD83D\uDEE1' : '[S]',
  key:      isColorSupported ? '\uD83D\uDD11' : '[K]',
  replay:   isColorSupported ? '\uD83D\uDD04' : '[R]',
  share:    isColorSupported ? '\uD83D\uDCE4' : '[>]',
  inspect:  isColorSupported ? '\uD83D\uDD0D' : '[?]',
  diff:     isColorSupported ? '\u2260' : '!=',
  clean:    isColorSupported ? '\uD83E\uDDF9' : '[C]',
  doctor:   isColorSupported ? '\uD83E\uDE7A' : '[D]',
  watch:    isColorSupported ? '\uD83D\uDC41' : '[W]',
};

/** ASCII art logo for --help and first-run experience (3-line compact form) */
export const ASCII_LOGO = `
  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588    \u2588\u2588 \u2588\u2588\u2588\u2588\u2588\u2588\u2588 
  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588    \u2588\u2588 \u2588\u2588\u2588\u2588\u2588    \u2588\u2588    \u2588\u2588 \u2588\u2588\u2588\u2588\u2588   
  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588  \u2588\u2588\u2588\u2588\u2588\u2588\u2588 
`.trim();

/** Compact logo for banners */
export const COMPACT_LOGO = `${c.cyan(c.bold('  \uD83E\uDEB2  BugProof'))}`;

function getTerminalWidth(): number {
  if (isTTY && process.stdout.columns) return process.stdout.columns;
  return 80;
}

function line(len: number): string {
  return c.dim(icons.divider.repeat(Math.max(0, len)));
}

/** Animated banner with compact logo */
export function banner(text: string): void {
  const width = getTerminalWidth();
  console.log();
  console.log(COMPACT_LOGO + c.dim('  ' + text));
  console.log(line(width - 2));
}

/** Help banner with full ASCII art */
export function helpBanner(): void {
  console.log();
  console.log(c.cyan(ASCII_LOGO));
  console.log(c.dim('  ') + c.bold('Executable bugs, not bug reports.'));
  console.log();
}

/** Terminal-width-aware section header */
export function section(title: string): void {
  const width = getTerminalWidth();
  const titleLen = title.length + 3;
  const lineLen = Math.max(10, width - titleLen - 2);
  console.log();
  console.log(c.bold('  ' + icons.box + ' ' + title) + ' ' + line(lineLen));
}

/** Compact section for nested output (reserved for future use) */
function _subSection(title: string): void {
  console.log();
  console.log(c.dim('  ') + c.bold(icons.corner + ' ' + title));
}

export function success(msg: string): void {
  console.log('  ' + c.green(icons.check) + '  ' + c.green(msg));
}

export function warn(msg: string): void {
  console.log('  ' + c.yellow(icons.warning) + '  ' + c.yellow(msg));
}

export function error(msg: string): void {
  console.log('  ' + c.red(icons.cross) + '  ' + c.red(msg));
}

export function info(msg: string): void {
  console.log('  ' + c.cyan(icons.arrow) + '  ' + msg);
}

export function kvLine(key: string, value: string, keyWidth = 18): void {
  console.log('  ' + c.dim(key.padEnd(keyWidth)) + ' ' + value);
}

/** Key-value pair with icon prefix */
export function kvIcon(icon: string, key: string, value: string, keyWidth = 18): void {
  console.log('  ' + icon + ' ' + c.dim(key.padEnd(keyWidth)) + ' ' + value);
}

export function exitWithError(msg: string, opts?: { jsonMode?: boolean; exitCode?: number }): never {
  const { jsonMode, exitCode = 1 } = opts ?? {};
  if (jsonMode) {
    console.log(JSON.stringify({ success: false, error: msg }));
  } else {
    error(msg);
  }
  process.exit(exitCode);
}

export function statusBadge(label: string, ok: boolean): void {
  const badge = ok ? c.green('[' + icons.check + ']') : c.red('[' + icons.cross + ']');
  console.log('    ' + badge + ' ' + label);
}

/** Multi-status row for doctor output */
export function statusRow(label: string, status: 'ok' | 'warn' | 'fail' | 'skip', detail?: string): void {
  const icon = status === 'ok'   ? c.green(icons.check) :
               status === 'warn' ? c.yellow(icons.warning) :
               status === 'fail' ? c.red(icons.cross) :
               c.gray('\u2014');
  const statusLabel = status === 'ok'   ? c.green('OK') :
                      status === 'warn' ? c.yellow('WARN') :
                      status === 'fail' ? c.red('FAIL') :
                      c.gray('N/A');
  console.log(`    ${icon}  ${label.padEnd(28)} ${statusLabel}${detail ? c.dim('  ' + detail) : ''}`);
}

/** Progress bar for long-running operations */
export class ProgressBar {
  private width: number;
  private total: number;
  private current = 0;
  private startTime = Date.now();
  private label: string;

  constructor(label: string, total: number) {
    this.label = label;
    this.total = total;
    this.width = getTerminalWidth() - 20;
  }

  update(current: number, suffix?: string) {
    this.current = current;
    if (!isTTY) return;
    const pct = Math.min(100, Math.round((current / this.total) * 100));
    const filled = Math.round((this.width * pct) / 100);
    const empty = this.width - filled;
    const bar = c.cyan('\u2588'.repeat(filled)) + c.dim('\u2591'.repeat(empty));
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    const suffixStr = suffix ? ` ${c.dim(suffix)}` : '';
    process.stdout.write(`\r  ${this.label} ${bar} ${pct}% ${c.dim(`(${elapsed}s)`)}${suffixStr}`);
  }

  step() {
    this.update(Math.min(this.total, this.current + 1));
  }

  complete(suffix?: string) {
    if (!isTTY) {
      console.log(`  ${c.green(icons.check)}  ${this.label} completed`);
      return;
    }
    this.update(this.total, suffix);
    process.stdout.write('\n');
  }
}

/** Branded spinner with custom frames and elapsed time */
export class Spinner {
  private frames = ['\u280B', '\u2819', '\u2839', '\u2838', '\u283C', '\u2834', '\u2826', '\u2827', '\u2807', '\u280F'];
  private currentFrame = 0;
  private interval: NodeJS.Timeout | null = null;
  private message: string;
  private startTime = Date.now();

  constructor(message: string) {
    this.message = message;
  }

  start() {
    if (!isTTY) {
      console.log(`  ${c.cyan(icons.arrow)}  ${this.message}...`);
      return;
    }
    process.stdout.write('\x1B[?25l');
    this.interval = setInterval(() => { this.render(); }, 80);
  }

  private render() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${c.cyan(this.frames[this.currentFrame])}  ${this.message}${c.dim(` (${elapsed}s)`)}`);
    this.currentFrame = (this.currentFrame + 1) % this.frames.length;
  }

  stop(successMsg?: string, isError = false) {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      process.stdout.write('\r\x1B[K');
      process.stdout.write('\x1B[?25h');
      if (successMsg) {
        if (isError) { error(successMsg); } else { success(successMsg); }
      }
    }
  }
}

/** Table renderer for structured output */
export function table(headers: string[], rows: string[][], colWidths?: number[]): void {
  const widths = colWidths || headers.map((h, i) =>
    Math.max(h.length, ...rows.map(r => (r[i] || '').length))
  );

  const headerLine = headers.map((h, i) => c.bold(c.cyan(h.padEnd(widths[i])))).join('  ');
  console.log('  ' + headerLine);
  console.log('  ' + c.dim(widths.map(w => icons.divider.repeat(w)).join('  ')));

  for (const row of rows) {
    const rowLine = row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
    console.log('  ' + rowLine);
  }
}

/** Summary box for final output */
export function summaryBox(title: string, items: { label: string; value: string; highlight?: boolean }[]): void {
  if (items.length === 0) return;
  const width = getTerminalWidth();
  const maxLabel = Math.max(...items.map(i => i.label.length));
  // Calculate box width: reserve space for borders (4), label, padding (4), and value
  const maxContentWidth = width - 8;
  const boxWidth = Math.max(title.length + 4, Math.min(maxContentWidth, maxLabel + 4 + 40));

  console.log();
  console.log(c.cyan(c.bold('  \u250C' + '\u2501'.repeat(boxWidth) + '\u2510')));
  console.log(c.cyan(c.bold('  \u2502')) + c.cyan(c.bold(' ' + title.padEnd(boxWidth - 1))) + c.cyan(c.bold('\u2502')));
  console.log(c.cyan(c.bold('  \u251C' + '\u2500'.repeat(boxWidth) + '\u2524')));
  for (const item of items) {
    const label = item.highlight ? c.bold(item.label.padEnd(maxLabel)) : c.dim(item.label.padEnd(maxLabel));
    // Truncate value to fit within box, leaving room for label, padding, and border
    const maxValLen = boxWidth - maxLabel - 6;
    let value = item.value;
    if (value.length > maxValLen && maxValLen > 3) {
      value = value.slice(0, maxValLen - 3) + c.dim('...');
    }
    const displayValue = item.highlight ? c.cyan(c.bold(value)) : value;
    const line = ` ${label}  ${displayValue}`;
    console.log(c.cyan(c.bold('  \u2502')) + line.padEnd(boxWidth) + c.cyan(c.bold('\u2502')));
  }
  console.log(c.cyan(c.bold('  \u2514' + '\u2501'.repeat(boxWidth) + '\u2518')));
  console.log();
}
