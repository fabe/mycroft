import chalk from "chalk";

const isTTY = () => Boolean(process.stdout.isTTY);
export const isInteractive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

export const formatDim = (text: string) => (isTTY() ? chalk.dim(text) : text);
export const formatError = (text: string) => (isTTY() ? chalk.red(text) : text);
export const formatBold = (text: string) => (isTTY() ? chalk.bold(text) : text);
export const formatWarn = (text: string) => (isTTY() ? chalk.yellow(text) : text);

export const stdout = (message: string) => {
  process.stdout.write(message.endsWith("\n") ? message : `${message}\n`);
};

export const stderr = (message: string) => {
  process.stderr.write(message.endsWith("\n") ? message : `${message}\n`);
};

export const printError = (message: string) => {
  stderr(formatError(`Error: ${message}`));
};

export const logInfo = (message: string) => {
  stderr(message);
};

export const logWarn = (message: string) => {
  stderr(formatWarn(message));
};

export const handleSigint = (onCancel?: () => void) => {
  const handler = () => {
    if (onCancel) onCancel();
    stderr("\nCancelled.");
    process.exit(130);
  };
  process.once("SIGINT", handler);
  return () => process.off("SIGINT", handler);
};
