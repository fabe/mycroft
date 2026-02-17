_mycroft() {
  local cur prev
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD-1]}"

  local top_commands="book config"
  local global_flags="--help --version --data-dir"
  local book_commands="ingest list show ask search delete"
  local config_commands="path init resolve onboard"

  if [[ ${COMP_CWORD} -le 1 ]]; then
    COMPREPLY=( $(compgen -W "${top_commands} ${global_flags}" -- "${cur}") )
    return 0
  fi

  case "${COMP_WORDS[1]}" in
    book)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${book_commands} ${global_flags}" -- "${cur}") )
        return 0
      fi
      case "${COMP_WORDS[2]}" in
        ingest)
          COMPREPLY=( $(compgen -W "--manual --no-summary" -- "${cur}") )
          return 0
          ;;
        ask|search)
          COMPREPLY=( $(compgen -W "--top-k --max-chapter" -- "${cur}") )
          return 0
          ;;
        delete)
          COMPREPLY=( $(compgen -W "--force" -- "${cur}") )
          return 0
          ;;
      esac
      ;;
    config)
      if [[ ${COMP_CWORD} -eq 2 ]]; then
        COMPREPLY=( $(compgen -W "${config_commands} ${global_flags}" -- "${cur}") )
        return 0
      fi
      ;;
  esac
}

complete -F _mycroft mycroft
