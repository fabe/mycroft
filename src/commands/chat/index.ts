import { registerChatStart } from "./start.js";
import { registerChatAsk } from "./ask.js";
import { registerChatList } from "./list.js";
import { registerChatShow } from "./show.js";
import { registerChatRepl } from "./repl.js";

export const registerChatCommands = (program: import("commander").Command) => {
  const chat = program.command("chat").description("Run multi-turn chat sessions");
  registerChatStart(chat);
  registerChatAsk(chat);
  registerChatList(chat);
  registerChatShow(chat);
  registerChatRepl(chat);
};
