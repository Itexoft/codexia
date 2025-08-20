export const aceMapping: Record<string, string> = {
  // JavaScript & TypeScript
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  mjs: "javascript",
  cjs: "javascript",
  // Web technologies
  html: "html",
  htm: "html",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  // Data formats
  json: "json",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  ini: "ini",
  cfg: "ini",
  conf: "ini",
  // Programming languages
  py: "python",
  java: "java",
  c: "c_cpp",
  cpp: "c_cpp",
  cc: "c_cpp",
  cxx: "c_cpp",
  h: "c_cpp",
  hpp: "c_cpp",
  cs: "csharp",
  php: "php",
  rb: "ruby",
  go: "golang",
  rs: "rust",
  swift: "swift",
  kt: "kotlin",
  // Shell & Scripts
  sh: "sh",
  bash: "sh",
  zsh: "sh",
  fish: "sh",
  // Database
  sql: "sql",
  // Documentation
  md: "markdown",
  markdown: "markdown",
  // Docker
  dockerfile: "dockerfile",
  // Other
  gitignore: "gitignore",
  txt: "text",
  log: "text"
};

export const editableExtensions = [
  'txt', 'md', 'json', 'xml', 'yaml', 'yml', 'log', 'cfg', 'conf', 'ini',
  'js', 'jsx', 'ts', 'tsx', 'py', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp',
  'css', 'html', 'php', 'rb', 'sh', 'sql', 'toml'
];