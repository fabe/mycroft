#compdef mycroft

_mycroft() {
  local -a top_commands
  top_commands=(book config chat)

  local -a book_commands
  book_commands=(ingest list show ask search delete)

  local -a config_commands
  config_commands=(path init resolve onboard)

  local -a chat_commands
  chat_commands=(start ask list show repl)

  local -a global_flags
  global_flags=(--help --version --data-dir)

  if (( CURRENT == 2 )); then
    _describe -t commands "mycroft commands" top_commands
    _describe -t flags "global flags" global_flags
    return
  fi

  case ${words[2]} in
    book)
      if (( CURRENT == 3 )); then
        _describe -t commands "book commands" book_commands
        _describe -t flags "global flags" global_flags
        return
      fi
      case ${words[3]} in
        ingest)
          _arguments "--manual[Interactive chapter selection]" "--no-summary[Skip AI chapter summaries]"
          return
          ;;
        ask|search)
          _arguments "--top-k[Number of passages to retrieve]:n" "--max-chapter[Spoiler-free limit]:n"
          return
          ;;
        delete)
          _arguments "--force[Skip confirmation]"
          return
          ;;
      esac
      ;;
    config)
      if (( CURRENT == 3 )); then
        _describe -t commands "config commands" config_commands
        _describe -t flags "global flags" global_flags
        return
      fi
      ;;
    chat)
      if (( CURRENT == 3 )); then
        _describe -t commands "chat commands" chat_commands
        _describe -t flags "global flags" global_flags
        return
      fi
      case ${words[3]} in
        ask|repl)
          _arguments "--top-k[Number of passages to retrieve]:n" "--max-chapter[Spoiler-free limit]:n"
          return
          ;;
        show)
          _arguments "--tail[Show last N messages]:n"
          return
          ;;
        start)
          _arguments "--title[Session title]:text"
          return
          ;;
      esac
      ;;
  esac
}

_mycroft
