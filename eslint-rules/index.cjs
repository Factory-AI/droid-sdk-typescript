'use strict';
module.exports = {
  rules: {
    'no-shell-injection': require('./no-shell-injection.cjs'),
    'no-unsafe-json-parse': require('./no-unsafe-json-parse.cjs'),
    'vi-mock-absolute-paths': require('./vi-mock-absolute-paths.cjs'),
    'no-unstable-mock-module': require('./no-unstable-mock-module.cjs'),
    'vi-mock-import-actual': require('./vi-mock-import-actual.cjs'),
  },
};
