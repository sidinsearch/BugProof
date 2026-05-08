/**
 * Colored terminal output for BugProof CLI.
 * Uses ANSI codes directly so we avoid ESM-only import issues with chalk v5.
 * Supports structured logging for CI/CD pipelines.
 */

const isColorSupported = process.stdout.isTTY && !process.env['NO_COLOR'];

function wrap(code: number, resetCode: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[${code}m${text}\x1b[${resetCode}m`;
}

export const c = {
  bold:    (t: string) => wrap(1, 22, t),
  dim:     (t: string) => wrap(2, 22, t),
  red:     (t: string) => wrap(31, 39, t),
  green:   (t: string) => wrap(32, 39, t),
  yellow:  (t: string) => wrap(33, 39, t),
  blue:    (t: string) => wrap(34, 39, t),
  magenta: (t: string) => wrap(35, 39, t),
  cyan:    (t: string) => wrap(36, 39, t),
  gray:    (t: string) => wrap(90, 39, t),
};

export const icons = {
  check:   isColorSupported ? '\u2714' : '+',
  cross:   isColorSupported ? '\u2718' : 'x',
  warning: isColorSupported ? '\u26A0' : '!',
  arrow:   isColorSupported ? '\u279C' : '>', // Sleeker arrow
  bug:     isColorSupported ? '\uD83E\uDEB2' : '*', // Beetle emoji for modern look
  box:     isColorSupported ? '\u25A0' : '#',
  dot:     isColorSupported ? '\u2022' : '-',
};

export function banner(text: string): void {
  const line = '\u2500'.repeat(Math.max(text.length + 4, 40));
  console.log();
  console.log(c.cyan(`\u256D${line}\u256E`));
  console.log(c.cyan(`\u2502  ${c.bold(text.padEnd(line.length - 2))}\u2502`));
  console.log(c.cyan(`\u2570${line}\u256F`));
  console.log();
}

export function success(msg: string): void {
  console.log(`  ${c.green(icons.check)} ${msg}`);
}

export function warn(msg: string): void {
  console.log(`  ${c.yellow(icons.warning)} ${msg}`);
}

export function error(msg: string): void {
  console.log(`  ${c.red(icons.cross)} ${msg}`);
}

export function info(msg: string): void {
  console.log(`  ${c.blue(icons.arrow)} ${msg}`);
}

export function kvLine(key: string, value: string): void {
  console.log(`  ${c.dim(key.padEnd(16))} ${value}`);
}
