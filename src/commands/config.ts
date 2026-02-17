import { configPath } from "../config";
import { stdout } from "./io";

export const configCommand = async () => {
  const path = configPath();
  stdout(path);
};
