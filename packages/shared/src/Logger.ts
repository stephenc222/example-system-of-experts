export default class Logger {
  namespace: string
  colors = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    dim: "\x1b[2m",
    underscore: "\x1b[4m",
    blink: "\x1b[5m",
    reverse: "\x1b[7m",
    hidden: "\x1b[8m",

    // Font colors
    black: "\x1b[30m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",

    // Background colors
    bgBlack: "\x1b[40m",
    bgRed: "\x1b[41m",
    bgGreen: "\x1b[42m",
    bgYellow: "\x1b[43m",
    bgBlue: "\x1b[44m",
    bgMagenta: "\x1b[45m",
    bgCyan: "\x1b[46m",
    bgWhite: "\x1b[47m",
  }

  constructor(namespace: string) {
    this.namespace = namespace
  }

  log(message: string) {
    console.log(
      `${this.colors.bright}${this.colors.blue}[${this.namespace}]${this.colors.reset} ${message}`
    )
  }

  info(message: string) {
    console.info(
      `${this.colors.green}[${this.namespace} INFO]${this.colors.reset} ${message}`
    )
  }

  warn(message: string) {
    console.warn(
      `${this.colors.yellow}[${this.namespace} WARN]${this.colors.reset} ${message}`
    )
  }

  error(message: string) {
    console.error(
      `${this.colors.red}[${this.namespace} ERROR]${this.colors.reset} ${message}`
    )
  }
}
