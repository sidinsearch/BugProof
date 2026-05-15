/**
 * BugProof Terminal UI — Production-grade CLI output.
 *
 * Semantic color hierarchy, terminal-width-aware sections, branded spinner.
 * NO_COLOR / isTTY aware.
 */

const isColorSupported = process.stdout.isTTY && !process.env['NO_COLOR'];

function wrap(code: number, resetCode: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[${code}m${text}\x1b[${resetCode}m`;
}

export const c = {
  bold:     (t: string) => wrap(1, 22, t),
  dim:      (t: string) => wrap(2, 22, t),
  italic:   (t: string) => wrap(3, 23, t),
  red:      (t: string) => wrap(31, 39, t),
  green:    (t: string) => wrap(32, 39, t),
  yellow:   (t: string) => wrap(33, 39, t),
  blue:     (t: string) => wrap(34, 39, t),
  magenta:  (t: string) => wrap(35, 39, t),
  cyan:     (t: string) => wrap(36, 39, t),
  gray:     (t: string) => wrap(90, 39, t),
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
};

function getTerminalWidth(): number {
  return process.stdout.isTTY && process.stdout.columns ? process.stdout.columns : 80;
}

function line(len: number): string {
  return c.dim(icons.divider.repeat(Math.max(0, len)));
}

export function banner(text: string): void {
  const width = getTerminalWidth();
  console.log();
  console.log(c.cyan(c.bold('  ' + icons.bug + '  ' + text)));
  console.log(line(width - 2));
}

export function section(title: string): void {
  const width = getTerminalWidth();
  const titleLen = title.length + 3;
  const lineLen = Math.max(10, width - titleLen - 2);
  console.log();
  console.log(c.bold('  ' + icons.box + ' ' + title) + ' ' + line(lineLen));
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

export function kvLine(key: string, value: string): void {
  console.log('  ' + c.dim(key.padEnd(18)) + ' ' + value);
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
    if (!process.stdout.isTTY) {
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
