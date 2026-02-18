function __mycroft_needs_command
  set -l cmd (commandline -opc)
  if test (count $cmd) -le 1
    return 0
  end
  return 1
end

function __mycroft_using_command
  set -l cmd (commandline -opc)
  set -l sub $argv[1]
  if test (count $cmd) -ge 2; and test $cmd[2] = $sub
    return 0
  end
  return 1
end

function __mycroft_using_subcommand
  set -l cmd (commandline -opc)
  set -l sub $argv[1]
  set -l subsub $argv[2]
  if test (count $cmd) -ge 3; and test $cmd[2] = $sub; and test $cmd[3] = $subsub
    return 0
  end
  return 1
end

complete -c mycroft -n '__mycroft_needs_command' -a 'book' -d 'Manage books and queries'
complete -c mycroft -n '__mycroft_needs_command' -a 'config' -d 'Manage configuration'
complete -c mycroft -n '__mycroft_needs_command' -a 'chat' -d 'Run multi-turn chat sessions'
complete -c mycroft -s h -l help -d 'Show help'
complete -c mycroft -l version -d 'Show version'
complete -c mycroft -l data-dir -r -d 'Override data directory'

complete -c mycroft -n '__mycroft_using_command book' -a 'ingest' -d 'Ingest an EPUB file'
complete -c mycroft -n '__mycroft_using_command book' -a 'list' -d 'List indexed books'
complete -c mycroft -n '__mycroft_using_command book' -a 'show' -d 'Show full book metadata'
complete -c mycroft -n '__mycroft_using_command book' -a 'ask' -d 'Ask a question about a book'
complete -c mycroft -n '__mycroft_using_command book' -a 'search' -d 'Vector search without LLM'
complete -c mycroft -n '__mycroft_using_command book' -a 'delete' -d 'Remove book, EPUB, and vectors'

complete -c mycroft -n '__mycroft_using_subcommand book ingest' -a 'status' -d 'Check ingestion status'
complete -c mycroft -n '__mycroft_using_subcommand book ingest' -a 'resume' -d 'Resume a pending ingestion'
complete -c mycroft -n '__mycroft_using_subcommand book ingest' -l manual -d 'Interactive chapter selection'
complete -c mycroft -n '__mycroft_using_subcommand book ingest' -l summary -d 'Enable AI chapter summaries'
complete -c mycroft -n '__mycroft_using_subcommand book ingest' -l batch -d 'Use OpenAI Batch API'
complete -c mycroft -n '__mycroft_using_command book; and __fish_seen_subcommand_from ask search' -l top-k -r -d 'Number of passages to retrieve'
complete -c mycroft -n '__mycroft_using_command book; and __fish_seen_subcommand_from ask search' -l max-chapter -r -d 'Spoiler-free limit'
complete -c mycroft -n '__mycroft_using_command book; and __fish_seen_subcommand_from delete' -l force -d 'Skip confirmation'

complete -c mycroft -n '__mycroft_using_command config' -a 'path' -d 'Print config path'
complete -c mycroft -n '__mycroft_using_command config' -a 'init' -d 'Create default config file'
complete -c mycroft -n '__mycroft_using_command config' -a 'resolve' -d 'Print resolved config values'
complete -c mycroft -n '__mycroft_using_command config' -a 'onboard' -d 'Initialize config and show next step'

complete -c mycroft -n '__mycroft_using_command chat' -a 'start' -d 'Start a chat session for a book'
complete -c mycroft -n '__mycroft_using_command chat' -a 'ask' -d 'Ask a question in a chat session'
complete -c mycroft -n '__mycroft_using_command chat' -a 'list' -d 'List chat sessions'
complete -c mycroft -n '__mycroft_using_command chat' -a 'show' -d 'Show chat session details'
complete -c mycroft -n '__mycroft_using_command chat' -a 'repl' -d 'Start interactive chat session'

complete -c mycroft -n '__mycroft_using_command chat; and __fish_seen_subcommand_from ask repl' -l top-k -r -d 'Number of passages to retrieve'
complete -c mycroft -n '__mycroft_using_command chat; and __fish_seen_subcommand_from ask repl' -l max-chapter -r -d 'Spoiler-free limit'
complete -c mycroft -n '__mycroft_using_command chat; and __fish_seen_subcommand_from show' -l tail -r -d 'Show last N messages'
complete -c mycroft -n '__mycroft_using_command chat; and __fish_seen_subcommand_from start' -l title -r -d 'Session title'
