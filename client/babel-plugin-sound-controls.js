const path = require('path')

const RN_CONTROLS = new Set([
  'Button',
  'Pressable',
  'TouchableHighlight',
  'TouchableOpacity',
  'TouchableWithoutFeedback',
])

module.exports = function soundControlsPlugin({ types: t }) {
  return {
    name: 'triplepoker-sound-controls',
    visitor: {
      Program(programPath, state) {
        const filename = state.filename && path.resolve(state.filename)
        const projectRoot = __dirname
        const appRoot = path.join(projectRoot, 'app') + path.sep
        const srcRoot = path.join(projectRoot, 'src') + path.sep
        const wrapper = path.join(srcRoot, 'components', 'ui', 'SoundControls')
        if (!filename || filename === `${wrapper}.tsx` || (!filename.startsWith(appRoot) && !filename.startsWith(srcRoot))) return

        const redirected = []
        for (const child of programPath.get('body')) {
          if (!child.isImportDeclaration()) continue
          const source = child.node.source.value
          const moved = child.node.specifiers.filter(specifier =>
            t.isImportSpecifier(specifier) && (
              (source === 'react-native' && RN_CONTROLS.has(specifier.imported.name)) ||
              (source === 'expo-router' && specifier.imported.name === 'Link')
            ),
          )
          if (!moved.length) continue
          child.node.specifiers = child.node.specifiers.filter(specifier => !moved.includes(specifier))
          redirected.push(...moved)
          if (!child.node.specifiers.length) child.remove()
        }
        if (!redirected.length) return

        let relative = path.relative(path.dirname(filename), wrapper).replace(/\\/g, '/')
        if (!relative.startsWith('.')) relative = `./${relative}`
        programPath.unshiftContainer('body', t.importDeclaration(redirected, t.stringLiteral(relative)))
      },
    },
  }
}
