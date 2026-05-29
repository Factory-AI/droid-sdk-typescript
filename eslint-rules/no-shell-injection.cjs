/**
 * @fileoverview Disallow template literal arguments in exec/execSync calls
 * @author Factory Infrastructure Team
 *
 * Catches shell injection risks where user-controlled values may be
 * interpolated into shell commands via template literals.
 *
 * BAD:  exec(`git clone ${repoUrl}`)
 * GOOD: spawn('git', ['clone', repoUrl])
 *
 * The rule tracks actual bindings from 'child_process' imports/requires so
 * it only flags calls that originate from the child_process module, avoiding
 * false positives on unrelated APIs (sandbox.exec, regex.exec, etc.).
 */
'use strict';

const EXEC_FUNCTIONS = new Set(['exec', 'execSync']);
const CHILD_PROCESS_MODULE = 'child_process';

/**
 * Returns the property name from a MemberExpression property node,
 * handling both `obj.exec` (Identifier) and `obj['exec']` (Literal) forms.
 */
function getPropertyName(property, computed) {
  if (!computed && property.type === 'Identifier') {
    return property.name;
  }
  if (
    computed &&
    property.type === 'Literal' &&
    typeof property.value === 'string'
  ) {
    return property.value;
  }
  return null;
}

/**
 * Unwraps optional-chaining wrappers so that `cp?.exec(...)` is handled
 * the same as `cp.exec(...)`.
 *
 * In ESLint's AST (estree), optional chaining produces a `ChainExpression`
 * whose `.expression` is the underlying `CallExpression` or `MemberExpression`
 * with `optional: true`.
 */
function unwrapChainExpression(node) {
  return node.type === 'ChainExpression' ? node.expression : node;
}

function hasExpressions(node) {
  return node.type === 'TemplateLiteral' && node.expressions.length > 0;
}

/**
 * Check if a node is a `require('child_process')` call.
 */
function isChildProcessRequire(node) {
  if (node.type !== 'CallExpression') return false;
  const callee = node.callee;
  if (callee.type !== 'Identifier' || callee.name !== 'require') return false;
  if (node.arguments.length === 0) return false;
  const arg = node.arguments[0];
  return arg.type === 'Literal' && arg.value === CHILD_PROCESS_MODULE;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow template literals with expressions in exec/execSync calls to prevent shell injection',
      category: 'Security',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noShellInjection:
        'Avoid template literals with interpolated values in exec/execSync — risk of shell injection. Use spawn() with an argument array, or quote/escape the interpolated values.',
    },
  },
  create(context) {
    // Set of local binding names that refer to exec/execSync functions
    // from child_process (e.g. `const { exec } = require('child_process')`)
    const execBindings = new Set();

    // Set of local binding names that refer to the child_process module
    // itself (e.g. `const cp = require('child_process')`)
    const moduleBindings = new Set();

    return {
      // ── Track ES imports ──────────────────────────────────────────
      //   import { exec } from 'child_process'
      //   import { exec as myExec } from 'child_process'
      //   import * as cp from 'child_process'
      //   import cp from 'child_process'
      ImportDeclaration(node) {
        if (!node.source || node.source.value !== CHILD_PROCESS_MODULE) return;

        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier') {
            const importedName =
              specifier.imported.type === 'Identifier'
                ? specifier.imported.name
                : specifier.imported.value;
            if (EXEC_FUNCTIONS.has(importedName)) {
              execBindings.add(specifier.local.name);
            }
          } else if (
            specifier.type === 'ImportDefaultSpecifier' ||
            specifier.type === 'ImportNamespaceSpecifier'
          ) {
            moduleBindings.add(specifier.local.name);
          }
        }
      },

      // ── Track CJS requires ────────────────────────────────────────
      //   const cp = require('child_process')
      //   const { exec, execSync } = require('child_process')
      //   const { exec: myExec } = require('child_process')
      VariableDeclarator(node) {
        if (!node.init || !isChildProcessRequire(node.init)) return;

        if (node.id.type === 'Identifier') {
          // const cp = require('child_process')
          moduleBindings.add(node.id.name);
        } else if (node.id.type === 'ObjectPattern') {
          // const { exec, execSync } = require('child_process')
          for (const prop of node.id.properties) {
            if (prop.type === 'Property' && prop.value.type === 'Identifier') {
              const key =
                prop.key.type === 'Identifier'
                  ? prop.key.name
                  : prop.key.type === 'Literal'
                    ? prop.key.value
                    : null;
              if (key && EXEC_FUNCTIONS.has(key)) {
                execBindings.add(prop.value.name);
              }
            }
          }
        }
      },

      // ── Check call expressions ────────────────────────────────────
      CallExpression(node) {
        if (node.arguments.length === 0) return;
        const firstArg = node.arguments[0];
        if (!hasExpressions(firstArg)) return;

        const callee = unwrapChainExpression(node.callee);

        // Direct call: exec(`...${x}...`) / myExec(`...${x}...`)
        if (callee.type === 'Identifier' && execBindings.has(callee.name)) {
          context.report({ node: firstArg, messageId: 'noShellInjection' });
          return;
        }

        // Member call: cp.exec(...), cp['execSync'](...), cp?.exec(...)
        if (callee.type === 'MemberExpression') {
          const propName = getPropertyName(callee.property, callee.computed);
          if (!propName || !EXEC_FUNCTIONS.has(propName)) return;

          const object = unwrapChainExpression(callee.object);

          // Tracked module binding: const cp = require('child_process'); cp.exec(...)
          if (object.type === 'Identifier' && moduleBindings.has(object.name)) {
            context.report({ node: firstArg, messageId: 'noShellInjection' });
            return;
          }

          // Inline require: require('child_process').exec(...)
          if (isChildProcessRequire(object)) {
            context.report({ node: firstArg, messageId: 'noShellInjection' });
            return;
          }
        }
      },
    };
  },
};
