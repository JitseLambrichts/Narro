// Every piece of interface text lives here, in English.
export const t = {
  emptyTitle: 'Open a project to start',
  openProject: 'Open project',

  settingsTitle: 'Settings',
  accountLabel: 'Claude account',
  accountHint:
    'Narro runs Claude Code with the sign-in it already has: your Claude account, or your own API key if you set one up for Claude Code.',
  checkingAccount: 'Checking…',
  notSignedIn: 'Not signed in',
  signedIn: 'Signed in',
  signedInAs: (email: string) => `Signed in as ${email}`,
  usingApiKey: 'Using your own Anthropic API key',
  signIn: 'Sign in with Claude',
  signOut: 'Sign out',
  finishInBrowser: 'Finish signing in in your browser.',
  browserFallback:
    'If the browser shows a code instead of coming back here, cancel and sign in once in Terminal with “claude auth login”.',
  signInFailed: 'Signing in did not finish. Try again.',
  modelLabel: 'Model',
  models: {
    'claude-opus-5-5': 'Claude Opus 5.5',
    'claude-sonnet-5-5': 'Claude Sonnet 5.5'
  },
  cancel: 'Cancel',
  done: 'Done',

  askPlaceholder: 'Ask anything…',
  send: 'Send',
  stop: 'Stop',
  stopped: 'Stopped',
  settings: 'Settings',
  noProject: 'No project',

  show: 'Show',
  hide: 'Hide',
  allow: 'Allow',
  allowed: 'Allowed',
  tooLargeNote: 'This file is too large or not text, so only the change is listed.',
  moreLines: (n: number) => `…and ${n} more lines`,
  seconds: (ms: number) => `${(ms / 1000).toFixed(1)} s`,
  changedFiles: 'Changed files',
  tasks: 'Tasks',

  card: {
    creating: (name: string) => `Creating ${name}`,
    editing: (name: string) => `Editing ${name}`,
    deleting: (name: string) => `Deleting ${name}`,
    created: (name: string) => `Created ${name}`,
    updated: (name: string) => `Updated ${name}`,
    deleted: (name: string) => `Deleted ${name}`,
    fileFailed: (name: string) => `Could not change ${name}`,
    updatingFiles: (n: number) => `Updating ${n} files`,
    updatedFiles: (n: number) => `Updated ${n} files`,
    filesFailed: (n: number) => `Could not update ${n} files`,
    runningCommand: 'Running a command',
    ranCommand: 'Ran a command',
    commandFailed: 'A command failed',
    stepFailed: (description: string) => `${description} failed`,
    activityMore: (first: string, more: number) => `${first} and ${more} more`,
    lookedAround: 'Looked around'
  }
}
