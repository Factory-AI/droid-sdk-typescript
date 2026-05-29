/**
 * @fileoverview Disallow vi.unstable_mockModule in favor of vi.mock
 * @author Factory Infrastructure Team
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Ban use of unstable_mockModule and prefer vi.mock instead',
      category: 'Testing',
      recommended: true,
    },
    messages: {
      noUnstableMockModule:
        'Do not use vi.unstable_mockModule(). Use vi.mock() instead.',
    },
    fixable: null,
    schema: [], // no options supported
  },

  create(context) {
    /**
     * Check whether a node is a vi.unstable_mockModule() call.
     * @param {Object} node - The AST node
     * @returns {boolean} True if it is a vi.unstable_mockModule() call
     */
    function isUnstableMockModuleCall(node) {
      return (
        node.type === 'CallExpression' &&
        node.callee.type === 'MemberExpression' &&
        node.callee.object.type === 'Identifier' &&
        node.callee.object.name === 'vi' &&
        node.callee.property.type === 'Identifier' &&
        node.callee.property.name === 'unstable_mockModule'
      );
    }

    return {
      CallExpression(node) {
        if (isUnstableMockModuleCall(node)) {
          context.report({
            node: node.callee.property,
            messageId: 'noUnstableMockModule',
          });
        }
      },
    };
  },
};
