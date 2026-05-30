/**
 * BugProof Terminal UI — Production-grade CLI output.
 *
 * Features:
 * - Terminal-width-aware section dividers
 * - Semantic color hierarchy (brand amber, success green, warning yellow, error red)
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

/** Wrap text with truecolor (24-bit) foreground */
function rgb(r: number, g: number, b: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}

/** Wrap text with truecolor (24-bit) background */
function bgRgb(r: number, g: number, b: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[48;2;${r};${g};${b}m${text}\x1b[49m`;
}

/** Brand color: #FFAA33 */
const BRAND_R = 255, BRAND_G = 170, BRAND_B = 51;

/** Dark grey for text on brand background: #2A2A2A */
const DARK_R = 42, DARK_G = 42, DARK_B = 42;

/** Brand-colored text */
function brand(text: string): string {
  return rgb(BRAND_R, BRAND_G, BRAND_B, text);
}

/** Brand background */
function bgBrand(text: string): string {
  return bgRgb(BRAND_R, BRAND_G, BRAND_B, text);
}

/** Dark text (for on-brand-bg) */
function dark(text: string): string {
  return rgb(DARK_R, DARK_G, DARK_B, text);
}

export const c = {
  bold:      (t: string) => wrap(1, 22, t),
  dim:       (t: string) => wrap(2, 22, t),
  italic:    (t: string) => wrap(3, 23, t),
  underline: (t: string) => wrap(4, 24, t),
  red:       (t: string) => wrap(31, 39, t),
  green:     (t: string) => wrap(32, 39, t),
  yellow:    (t: string) => wrap(33, 39, t),
  blue:      (t: string) => wrap(34, 39, t),
  magenta:   (t: string) => wrap(35, 39, t),
  cyan:      (t: string) => wrap(36, 39, t),
  white:     (t: string) => wrap(37, 39, t),
  black:     (t: string) => wrap(30, 39, t),
  gray:      (t: string) => wrap(90, 39, t),
  bgCyan:    (t: string) => wrap(46, 49, t),
  bgRed:     (t: string) => wrap(41, 49, t),
  bgGreen:   (t: string) => wrap(42, 49, t),
  brand,
  bgBrand,
  dark,
};

export const icons = {
  check:     isColorSupported ? '\u2714' : '+',
  cross:     isColorSupported ? '\u2718' : 'x',
  warning:   isColorSupported ? '\u26A0' : '!',
  arrow:     isColorSupported ? '\u279C' : '>',
  bug:       isColorSupported ? '\uD83E\uDEB2' : '*',
  box:       isColorSupported ? '\u25A0' : '#',
  dot:       isColorSupported ? '\u2022' : '-',
  divider:   isColorSupported ? '\u2501' : '-',
  corner:    isColorSupported ? '\u251C' : '+',
  cornerEnd: isColorSupported ? '\u2514' : '+',
  line:      isColorSupported ? '\u2502' : '|',
  shield:    isColorSupported ? '\uD83D\uDEE1' : '[S]',
  key:       isColorSupported ? '\uD83D\uDD11' : '[K]',
  replay:    isColorSupported ? '\uD83D\uDD04' : '[R]',
  share:     isColorSupported ? '\uD83D\uDCE4' : '[>]',
  inspect:   isColorSupported ? '\uD83D\uDD0D' : '[?]',
  diff:      isColorSupported ? '\u2260' : '!=',
  clean:     isColorSupported ? '\uD83E\uDDF9' : '[C]',
  doctor:    isColorSupported ? '\uD83E\uDE7A' : '[D]',
  watch:     isColorSupported ? '\uD83D\uDC41' : '[W]',
};

const TAGLINE = 'Executable bugs, not bug reports.';

/** Branded logo — amber badge with dark text */
export const ASCII_LOGO = [
  '',
  c.bgBrand(c.bold(dark(' BugProof '))) + c.dim('  ' + TAGLINE),
  '',
].join('\n');

/** Compact logo for inline banners — just the brand name, no icon */
export const COMPACT_LOGO = c.bold(brand('BugProof'));

/** Print the branded logo (text-only, no image) */
let _logoRendered = false;
export async function renderLogo(): Promise<void> {
  if (_logoRendered) return;
  console.log(ASCII_LOGO);
  _logoRendered = true;
}

function getTerminalWidth(): number {
  if (isTTY && process.stdout.columns) return process.stdout.columns;
  return 80;
}

function line(len: number): string {
  return c.dim(icons.divider.repeat(Math.max(0, len)));
}

/** Animated banner with compact logo and subtle separator */
export function banner(text: string): void {
  const width = getTerminalWidth();
  console.log();
  console.log('  ' + COMPACT_LOGO + c.dim('  ' + text));
  console.log(c.dim('  ' + '\u2500'.repeat(Math.min(width - 4, 60))));
}

/** Help banner — clean branded header for --help */
export function helpBanner(): void {
  console.log(ASCII_LOGO);
}

/** Terminal-width-aware section header */
export function section(title: string): void {
  const width = getTerminalWidth();
  const titleLen = title.length + 3;
  const lineLen = Math.max(10, width - titleLen - 2);
  console.log();
  console.log(c.bold(brand('  ' + icons.box + ' ' + title)) + ' ' + line(lineLen));
}

/** Compact section for nested output (reserved for future use) */
function _subSection(title: string): void {
  console.log();
  console.log(c.dim('  ') + c.bold(icons.corner + ' ' + title));
}

export function success(msg: string): void {
  console.log('  ' + c.green(icons.check) + '  ' + msg);
}

export function warn(msg: string): void {
  console.log('  ' + c.yellow(icons.warning) + '  ' + c.yellow(msg));
}

export function error(msg: string): void {
  console.log('  ' + c.red(icons.cross) + '  ' + c.bold(c.red(msg)));
}

export function info(msg: string): void {
  console.log('  ' + brand(icons.arrow) + '  ' + c.dim(msg));
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
    const bar = brand('\u2588'.repeat(filled)) + c.dim('\u2591'.repeat(empty));
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
      console.log(`  ${brand(icons.arrow)}  ${this.message}...`);
      return;
    }
    process.stdout.write('\x1B[?25l');
    this.interval = setInterval(() => { this.render(); }, 80);
  }

  private render() {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  ${brand(this.frames[this.currentFrame])}  ${this.message}${c.dim(` (${elapsed}s)`)}`);
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

  const headerLine = headers.map((h, i) => c.bold(brand(h.padEnd(widths[i])))).join('  ');
  console.log('  ' + headerLine);
  console.log('  ' + c.dim(widths.map(w => icons.divider.repeat(w)).join('  ')));

  for (const row of rows) {
    const rowLine = row.map((cell, i) => cell.padEnd(widths[i])).join('  ');
    console.log('  ' + rowLine);
  }
}

/** Summary box for final output — heavy/double borders, wraps long text */
export function summaryBox(title: string, items: { label: string; value: string; highlight?: boolean }[]): void {
  if (items.length === 0) return;
  const width = getTerminalWidth();
  const maxLabel = Math.max(...items.map(i => stripAnsi(i.label).length));
  const labelPad = maxLabel + 2;

  // Box margins: "  " (2) + left border (1) + space (1) + content + space (1) + right border (1) + "  " (2) = 8 chars overhead
  const boxOverhead = 8;
  const maxContentWidth = width - boxOverhead;

  // Calculate minimum width needed: leading space + label column + longest value
  const maxRawValue = Math.max(...items.map(i => stripAnsi(i.value).length));
  const minContentWidth = 1 + labelPad + maxRawValue;

  // Box inner width: cap at terminal width, but at least as wide as the longest single-line item
  const boxInnerWidth = Math.min(maxContentWidth, Math.max(minContentWidth, title.length + 4));

  // Value column width for wrapping (subtract 1 for the leading space in lineContent)
  const valueColWidth = boxInnerWidth - labelPad - 1;

  console.log();

  // Heavy box: ┏ ━ ┓ ┃ ┣ ┫ ┗ ┛
  const topLine = '\u250F' + '\u2501'.repeat(boxInnerWidth) + '\u2513';
  console.log(brand(c.bold('  ' + topLine)));

  // Title row
  const titlePadded = ' ' + title + ' '.repeat(Math.max(0, boxInnerWidth - title.length - 1));
  console.log(brand(c.bold('  \u2503' + titlePadded + '\u2503')));

  // Separator: ┣━━━...━━━┫
  const sepLine = '\u2523' + '\u2501'.repeat(boxInnerWidth) + '\u252B';
  console.log(brand(c.bold('  ' + sepLine)));

  // Content rows
  for (const item of items) {
    const label = item.highlight ? c.bold(brand(item.label)) : c.dim(item.label);
    const paddedLabel = label + ' '.repeat(Math.max(0, maxLabel - stripAnsi(item.label).length + 2));

    // Wrap value into multiple lines if needed
    const wrappedLines = wrapValue(item.value, valueColWidth);

    for (let i = 0; i < wrappedLines.length; i++) {
      const valueLine = wrappedLines[i];
      let lineContent: string;
      if (i === 0) {
        // First line: label + value
        lineContent = ` ${paddedLabel}${valueLine}`;
      } else {
        // Continuation lines: indent to align with value column
        lineContent = ` ${' '.repeat(maxLabel + 2)}${valueLine}`;
      }

      const visibleLen = stripAnsi(lineContent).length;
      const padding = ' '.repeat(Math.max(0, boxInnerWidth - visibleLen));
      console.log(brand(c.bold('  \u2503')) + lineContent + padding + brand(c.bold('\u2503')));
    }
  }

  // Bottom line: ┗━━━...━━━┛
  const bottomLine = '\u2517' + '\u2501'.repeat(boxInnerWidth) + '\u251B';
  console.log(brand(c.bold('  ' + bottomLine)));
  console.log();
}

/**
 * Wraps a value string (which may contain ANSI codes) into multiple lines
 * of at most `maxWidth` visible characters each.
 * Preserves ANSI codes — they are carried forward to continuation lines.
 */
function wrapValue(value: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [value];
  const visible = stripAnsi(value);
  if (visible.length <= maxWidth) return [value];

  const lines: string[] = [];
  let pos = 0;
  while (pos < visible.length) {
    const end = Math.min(pos + maxWidth, visible.length);
    lines.push(visible.slice(pos, end));
    pos = end;
  }
  return lines;
}

/** Strip ANSI escape codes from a string for length calculation */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}
