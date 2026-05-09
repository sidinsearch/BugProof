const isColorSupported = process.stdout.isTTY && !process.env['NO_COLOR'];

function wrap(code: number, resetCode: number, text: string): string {
  if (!isColorSupported) return text;
  return `\x1b[${code}m${text}\x1b[${resetCode}m`;
}

export const c = {
  bold:    (t: string) => wrap(1, 22, t),
  dim:     (t: string) => wrap(2, 22, t),
  italic:  (t: string) => wrap(3, 23, t),
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
  arrow:   isColorSupported ? '\u279C' : '>',
  bug:     isColorSupported ? '\uD83E\uDEB2' : '*',
  box:     isColorSupported ? '\u25A0' : '#',
  dot:     isColorSupported ? '\u2022' : '-',
  divider: isColorSupported ? '\u2501' : '-',
  corner:  isColorSupported ? '\u251C' : '+',
  cornerEnd: isColorSupported ? '\u2514' : '+',
  line:    isColorSupported ? '\u2502' : '|',
};

function line(len: number): string {
  return icons.divider.repeat(len);
}

export function banner(text: string): void {
  const pad = 4;
  const innerLen = text.length + pad * 2;
  console.log();
  console.log(c.cyan(c.bold('  ' + icons.bug + '  ' + text)));
  console.log(c.dim('  ' + line(innerLen)));
}

export function section(title: string): void {
  console.log();
  console.log(c.bold('  ' + icons.box + ' ' + title));
  console.log(c.dim('  ' + line(40)));
}

export function success(msg: string): void {
  console.log('  ' + c.green(icons.check) + '  ' + msg);
}

export function warn(msg: string): void {
  console.log('  ' + c.yellow(icons.warning) + '  ' + msg);
}

export function error(msg: string): void {
  console.log('  ' + c.red(icons.cross) + '  ' + msg);
}

export function info(msg: string): void {
  console.log('  ' + c.blue(icons.arrow) + '  ' + msg);
}

export function kvLine(key: string, value: string): void {
  console.log('  ' + c.dim(key.padEnd(18)) + ' ' + value);
}

export function statusBadge(label: string, ok: boolean): void {
  const badge = ok ? c.green('[' + icons.check + ']') : c.red('[' + icons.cross + ']');
  console.log('    ' + badge + ' ' + label);
}
