import { configPath } from "../config.js";
import { stdout } from "./io.js";

export const configCommand = async () => {
  const path = configPath();
  stdout(path);
};
