const Module = require('node:module');
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'obsidian') return require('./obsidian-mock');
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions['.md'] = (module, filename) => {
  module.exports = require('node:fs').readFileSync(filename, 'utf8');
};
