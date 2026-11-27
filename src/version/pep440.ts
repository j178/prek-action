function expandCompatibleRelease(version: string): string {
  const segments = version.split('.')
  if (
    segments.length < 2 ||
    segments.length > 3 ||
    segments.some(segment => !/^\d+$/.test(segment))
  ) {
    throw new Error(
      `Unsupported PEP 440 compatible release specifier: "~=${version}". Expected "~=X.Y" or "~=X.Y.Z".`,
    )
  }

  const numericSegments = segments.map(segment => Number(segment))
  if (numericSegments.length === 2) {
    const [major, minor] = numericSegments
    return `>=${major}.${minor}.0 <${major + 1}.0.0`
  }

  const [major, minor, patch] = numericSegments
  return `>=${major}.${minor}.${patch} <${major}.${minor + 1}.0`
}

export function translatePep440Specifier(specifier: string): string | null {
  const parts = specifier
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  if (parts.length === 0) return null

  const translated = parts.map(part => {
    const match = part.match(/^(~=|==|!=|<=?|>=?)\s*(.+)$/)
    if (!match) return part

    const [, operator, version] = match
    if (operator === '~=') {
      return expandCompatibleRelease(version)
    }

    // PEP 440 pads omitted release components with zeros: 0.3 -> 0.3.0.
    const release = version.match(/^(\d+)(?:\.(\d+))?$/)
    const normalizedVersion = release ? `${release[1]}.${release[2] ?? '0'}.0` : version
    return `${operator === '==' ? '' : operator}${normalizedVersion}`
  })

  return translated.join(' ')
}
