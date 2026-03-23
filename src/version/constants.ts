export const TOOL_VERSIONS_FILENAME = '.tool-versions'
export const PREK_PACKAGE_NAME = '@j178/prek'
export const REQUIREMENTS_FILE_RE = /^requirements.*\.txt$/
export const PEP508_PREK_RE = /^prek(?:\[.*?\])?\s*((?:~=|==|!=|<=?|>=?)[^;]+)/i

export const VERSION_FILE_HINTS: Record<string, string> = {
  '.tool-versions': 'Expected a "prek <version>" line.',
  'mise.toml': 'Expected [tools].prek or [tools.prek].version.',
  'package.json': 'Expected @j178/prek in dependencies or devDependencies.',
  'pyproject.toml':
    'Checked [tool.prek].version, [dependency-groups], and [project.optional-dependencies].',
  'uv.lock': 'Expected a [[package]] entry with name = "prek".',
}

export const SUPPORTED_VERSION_FILE_NAMES = [
  TOOL_VERSIONS_FILENAME,
  'mise.toml',
  'uv.lock',
  'pyproject.toml',
  'package.json',
] as const
