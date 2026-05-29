/**
 * @fileoverview Ban .json() calls on response/request objects to prevent
 * silent failures when non-JSON bodies are returned (Cloudflare pages,
 * nginx 501s, HTML error pages, etc.).
 * @author Factory Infrastructure Team
 *
 * BAD:  const data = await response.json()
 * GOOD: const body = await response.text()
 *       try { const data = JSON.parse(body) }
 *       catch { throw new Error("Failed to parse JSON", { body }) }
 */
'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Ban .json() calls — non-JSON responses will throw without exposing the body',
      category: 'Best Practices',
      recommended: true,
    },
    fixable: null,
    schema: [],
    messages: {
      noUnsafeJsonParse:
        'Calling .json() directly is unsafe — non-JSON responses (HTML error pages, etc.) ' +
        'will throw without exposing the response body. Instead, read the body as text first:\n\n' +
        '  const body = await response.text();\n' +
        '  try {\n' +
        '    const data = JSON.parse(body);\n' +
        '  } catch {\n' +
        '    throw new Error("Failed to parse JSON", { body });\n' +
        '  }',
    },
  },

  create(context) {
    return {
      CallExpression(node) {
        const callee = node.callee;

        if (callee.type !== 'MemberExpression') return;

        // Get property name, handling both obj.json() and obj['json']()
        const propName = callee.computed
          ? callee.property.type === 'Literal' && callee.property.value
          : callee.property.type === 'Identifier' && callee.property.name;

        if (propName !== 'json') return;

        // Must be called with zero arguments (distinguishes from e.g. Zod .json(schema))
        if (node.arguments.length > 0) return;

        // Whitelist: express.json() is a middleware factory, not a response parse
        if (
          callee.object.type === 'Identifier' &&
          callee.object.name === 'express'
        ) {
          return;
        }

        context.report({
          node,
          messageId: 'noUnsafeJsonParse',
        });
      },
    };
  },
};
