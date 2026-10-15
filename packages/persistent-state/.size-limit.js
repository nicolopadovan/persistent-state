export default [
  ['core', 'dist/index.js', '3.6 kB'],
  ['core: tree-shaken to persistentState', 'dist/index.js', '3.45 kB', '{ persistentState }'],
  ['react', 'dist/react/index.js', '4.1 kB'],
  ['next', 'dist/next.js', '0.85 kB'],
].map(([name, path, limit, imports]) => ({ name, path, limit, import: imports }))
