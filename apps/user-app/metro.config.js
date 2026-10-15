const fs = require('fs');
const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

/**
 * The app runs the SAME screens as the website: they live in frontend/src/user and are bundled from there.
 * Where the browser and the phone differ, a twin file next to the web one (e.g. primitives.native.jsx)
 * is picked automatically on the phone; Vite never sees those files.
 */
const appRoot = __dirname;
const webUser = path.resolve(appRoot, '../../frontend/src/user');

const alias = {
  'react-router-dom': path.join(webUser, 'router.native.jsx'), // URL-style navigation on top of React Navigation
  'lucide-react': 'lucide-react-native', // same icons, drawn natively
};
const prefixAlias = {
  '@theme/': path.join(appRoot, 'src/theme/'),
  '@locales/': path.join(appRoot, 'src/i18n/locales/'),
};

// Windows builds may run from a short drive alias (subst B:) to dodge the 260-character path limit;
// Node reports some files under the real C: path, so watch both spellings of this folder.
const realAppRoot = fs.realpathSync.native(appRoot);
const extraRoots = realAppRoot !== appRoot ? [realAppRoot] : [];

const config = {
  watchFolders: [webUser, ...extraRoots],
  resolver: {
    // packages always come from this app's node_modules (one copy of React)
    nodeModulesPaths: [path.join(appRoot, 'node_modules')],
    disableHierarchicalLookup: true,
    sourceExts: ['js', 'jsx', 'ts', 'tsx', 'json', 'cjs', 'mjs'],
    resolveRequest: (context, moduleName, platform) => {
      if (alias[moduleName]) return context.resolveRequest(context, alias[moduleName], platform);
      for (const [prefix, dir] of Object.entries(prefixAlias)) {
        if (moduleName.startsWith(prefix)) return context.resolveRequest(context, dir + moduleName.slice(prefix.length), platform);
      }
      return context.resolveRequest(context, moduleName, platform);
    },
  },
};

module.exports = mergeConfig(getDefaultConfig(appRoot), config);
