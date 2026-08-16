const INSTALL_COMMAND_PREFIX = 'dsh plugin --profile web add '
const MAX_SPEC_LENGTH = 1_024
const UNSAFE_SHELL_ARGUMENT = /[\s\0&|;<>()^"'`$%!]/u

/**
 * Accepts either a package spec or the exact install command published by the
 * community registry. The returned value is passed to pnpm as one argument;
 * it is never interpreted by a shell.
 */
export function normalizePluginSpec(value: string): string {
  const trimmed = value.trim()
  const spec = trimmed.startsWith(INSTALL_COMMAND_PREFIX)
    ? trimmed.slice(INSTALL_COMMAND_PREFIX.length).trim()
    : trimmed
  // Upstream DSH uses `shell: true` when it forwards pnpm on Windows. Keeping
  // this to exactly one shell-safe token prevents both argument smuggling and
  // command injection. Local paths therefore need to contain no whitespace or
  // shell metacharacters; this matches pnpm's single package-argument model.
  if (spec === '' || spec.length > MAX_SPEC_LENGTH || UNSAFE_SHELL_ARGUMENT.test(spec) || spec.startsWith('-')) {
    throw new Error('Invalid DSH plugin package specification.')
  }
  return spec
}

/** Registry entries must contain one package argument, not extra pnpm flags. */
export function registryInstallSpec(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.startsWith(INSTALL_COMMAND_PREFIX)) return undefined
  try {
    const spec = normalizePluginSpec(value)
    return spec
  } catch {
    return undefined
  }
}

/** Package names are validated before being used as paths or removal args. */
export function isNpmPackageName(value: string): boolean {
  return /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/u.test(value)
}
