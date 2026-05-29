/**
 * @fileoverview Require vi.mock() to include a second arg with vi.importActual()
 * @author Factory Infrastructure Team
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Enforce that vi.mock() calls have 2 arguments and the second contains vi.importActual()',
      category: 'Testing',
      recommended: true,
    },
    messages: {
      missingSecondArgument:
        'vi.mock() must have a second argument to prevent auto-mocking all exports',
      missingImportActual:
        'The second argument of vi.mock() must contain a call to vi.importActual()',
      pointlessImportActualOnly:
        'vi.mock() that only spreads vi.importActual() is pointless and should be removed',
    },
    fixable: 'code',
    schema: [], // no options supported
  },

  create(context) {
    const sourceCode = context.sourceCode ?? context.getSourceCode();
    const filename = context.filename ?? context.getFilename();

    // Only apply this rule to test files
    const isTestFile =
      filename.includes('.test.') ||
      filename.includes('.spec.') ||
      filename.includes('__tests__/');

    if (!isTestFile) {
      return {};
    }

    function unwrapCallee(callee) {
      if (
        callee &&
        (callee.type === 'TSInstantiationExpression' ||
          callee.type === 'ChainExpression')
      ) {
        return unwrapCallee(callee.expression);
      }
      return callee;
    }

    /**
     * Check whether a node is a vi.mock() call.
     * @param {Object} node - The AST node
     * @returns {boolean} True if it is a vi.mock() call
     */
    function isViMockCall(node) {
      return (
        node.type === 'CallExpression' &&
        unwrapCallee(node.callee).type === 'MemberExpression' &&
        unwrapCallee(node.callee).object.type === 'Identifier' &&
        unwrapCallee(node.callee).object.name === 'vi' &&
        unwrapCallee(node.callee).property.type === 'Identifier' &&
        unwrapCallee(node.callee).property.name === 'mock'
      );
    }

    /**
     * Check whether a node is a vi.importActual() call.
     * @param {Object} node - The AST node to check
     * @returns {boolean} True if it is a vi.importActual() call
     */
    function isViImportActualCall(node) {
      return (
        node &&
        node.type === 'CallExpression' &&
        node.callee &&
        unwrapCallee(node.callee).type === 'MemberExpression' &&
        unwrapCallee(node.callee).object &&
        unwrapCallee(node.callee).object.type === 'Identifier' &&
        unwrapCallee(node.callee).object.name === 'vi' &&
        unwrapCallee(node.callee).property &&
        unwrapCallee(node.callee).property.type === 'Identifier' &&
        unwrapCallee(node.callee).property.name === 'importActual'
      );
    }

    /**
     * Check whether a mock function only spreads vi.importActual() with no additions.
     * @param {Object} node - The function node (ArrowFunctionExpression or FunctionExpression)
     * @returns {boolean} True if it only spreads vi.importActual()
     */
    function isPointlessImportActualOnly(node) {
      if (!node) return false;

      // Handle arrow function: () => ({ ...(await vi.importActual<object>('module')) })
      if (node.type === 'ArrowFunctionExpression') {
        const body = node.body;

        // Check for object expression bodies
        if (body && body.type === 'ObjectExpression') {
          return isObjectOnlySpreadingImportActual(body);
        }

        // Check for block bodies with a return
        if (body && body.type === 'BlockStatement') {
          // Require exactly one return statement
          if (
            body.body.length === 1 &&
            body.body[0].type === 'ReturnStatement'
          ) {
            const returnArg = body.body[0].argument;
            if (returnArg && returnArg.type === 'ObjectExpression') {
              return isObjectOnlySpreadingImportActual(returnArg);
            }
          }
        }
      }

      // Handle function expressions
      if (node.type === 'FunctionExpression') {
        const body = node.body;
        if (body && body.type === 'BlockStatement') {
          // Require exactly one return statement
          if (
            body.body.length === 1 &&
            body.body[0].type === 'ReturnStatement'
          ) {
            const returnArg = body.body[0].argument;
            if (returnArg && returnArg.type === 'ObjectExpression') {
              return isObjectOnlySpreadingImportActual(returnArg);
            }
          }
        }
      }

      return false;
    }

    /**
     * Check whether an object expression only spreads vi.importActual().
     * @param {Object} objectNode - The ObjectExpression node
     * @returns {boolean} True if it only spreads vi.importActual()
     */
    function isObjectOnlySpreadingImportActual(objectNode) {
      if (!objectNode || objectNode.type !== 'ObjectExpression') {
        return false;
      }

      const properties = objectNode.properties;
      if (!properties || !Array.isArray(properties)) {
        return false;
      }

      // Must have exactly one property
      if (properties.length !== 1) {
        return false;
      }

      const prop = properties[0];

      // Accept spread elements
      if (prop.type === 'SpreadElement') {
        return containsViImportActual(prop.argument);
      }

      // Handle experimental spread properties in older parsers
      if (
        prop.type === 'SpreadProperty' ||
        prop.type === 'ExperimentalSpreadProperty'
      ) {
        return containsViImportActual(prop.argument);
      }

      return false;
    }

    /**
     * Check whether a node contains a vi.importActual() call.
     * @param {Object} node - The AST node to check
     * @returns {boolean} True if the node contains vi.importActual()
     */
    function containsViImportActual(node) {
      if (!node) return false;

      // Direct check for vi.importActual() call
      if (isViImportActualCall(node)) {
        return true;
      }

      // Recursively check node types
      switch (node.type) {
        case 'ArrowFunctionExpression':
        case 'FunctionExpression':
          return containsViImportActual(node.body);

        case 'BlockStatement':
          return node.body && Array.isArray(node.body)
            ? node.body.some((statement) => containsViImportActual(statement))
            : false;

        case 'ReturnStatement':
          return containsViImportActual(node.argument);

        case 'ObjectExpression':
          // Ensure properties exists and is an array
          if (!node.properties || !Array.isArray(node.properties)) {
            return false;
          }
          return node.properties.some((prop) => {
            // Handle SpreadElement directly in properties array
            if (prop.type === 'SpreadElement') {
              return containsViImportActual(prop.argument);
            }
            // Handle regular Property nodes
            if (prop.type === 'Property') {
              return containsViImportActual(prop.value);
            }
            // Handle experimental SpreadProperty (older parsers)
            if (
              prop.type === 'SpreadProperty' ||
              prop.type === 'ExperimentalSpreadProperty'
            ) {
              return containsViImportActual(prop.argument);
            }
            return false;
          });

        case 'SpreadElement':
          return containsViImportActual(node.argument);

        case 'AwaitExpression':
          return containsViImportActual(node.argument);

        case 'CallExpression':
          // Check if this is vi.importActual()
          if (
            node.callee &&
            unwrapCallee(node.callee).type === 'MemberExpression' &&
            unwrapCallee(node.callee).object &&
            unwrapCallee(node.callee).object.type === 'Identifier' &&
            unwrapCallee(node.callee).object.name === 'vi' &&
            unwrapCallee(node.callee).property &&
            unwrapCallee(node.callee).property.type === 'Identifier' &&
            unwrapCallee(node.callee).property.name === 'importActual'
          ) {
            return true;
          }
          // Check arguments
          return node.arguments && Array.isArray(node.arguments)
            ? node.arguments.some((arg) => containsViImportActual(arg))
            : false;

        case 'MemberExpression':
          return (
            containsViImportActual(node.object) ||
            containsViImportActual(node.property)
          );

        case 'ArrayExpression':
          return node.elements && Array.isArray(node.elements)
            ? node.elements.some((element) => containsViImportActual(element))
            : false;

        case 'ConditionalExpression':
          return (
            containsViImportActual(node.test) ||
            containsViImportActual(node.consequent) ||
            containsViImportActual(node.alternate)
          );

        case 'LogicalExpression':
        case 'BinaryExpression':
          return (
            containsViImportActual(node.left) ||
            containsViImportActual(node.right)
          );

        case 'UnaryExpression':
        case 'UpdateExpression':
          return containsViImportActual(node.argument);

        case 'AssignmentExpression':
          return (
            containsViImportActual(node.left) ||
            containsViImportActual(node.right)
          );

        case 'ExpressionStatement':
          return containsViImportActual(node.expression);

        case 'VariableDeclaration':
          return node.declarations && Array.isArray(node.declarations)
            ? node.declarations.some((decl) =>
                containsViImportActual(decl.init)
              )
            : false;

        case 'VariableDeclarator':
          return containsViImportActual(node.init);

        case 'TemplateLiteral':
          return node.expressions && Array.isArray(node.expressions)
            ? node.expressions.some((expr) => containsViImportActual(expr))
            : false;

        case 'TaggedTemplateExpression':
          return (
            containsViImportActual(node.tag) ||
            containsViImportActual(node.quasi)
          );

        case 'NewExpression':
          return (
            containsViImportActual(node.callee) ||
            (node.arguments && Array.isArray(node.arguments)
              ? node.arguments.some((arg) => containsViImportActual(arg))
              : false)
          );

        case 'SequenceExpression':
          return node.expressions && Array.isArray(node.expressions)
            ? node.expressions.some((expr) => containsViImportActual(expr))
            : false;

        default:
          return false;
      }
    }

    return {
      CallExpression(node) {
        // Check for vi.mock() calls
        if (!isViMockCall(node)) {
          return;
        }

        // Enforce a second argument
        if (node.arguments.length < 2) {
          context.report({
            node,
            messageId: 'missingSecondArgument',
            fix(fixer) {
              // Extract the module path from the first argument
              const firstArg = node.arguments[0];
              const modulePath = sourceCode.getText(firstArg);

              // Add a second argument with vi.importActual
              const secondArg = `, async () => ({ ...(await vi.importActual<object>(${modulePath})) })`;

              // Insert after the first argument
              return fixer.insertTextAfter(firstArg, secondArg);
            },
          });
          return;
        }

        // Ensure the second argument calls vi.importActual()
        const secondArg = node.arguments[1];
        const hasImportActual = containsViImportActual(secondArg);

        if (!hasImportActual) {
          context.report({
            node: secondArg || node,
            messageId: 'missingImportActual',
          });
          return;
        }

        // Flag pointless mocks that only spread vi.importActual
        if (isPointlessImportActualOnly(secondArg)) {
          context.report({
            node: secondArg || node,
            messageId: 'pointlessImportActualOnly',
            fix(fixer) {
              // Remove the entire vi.mock() statement
              // Find the ExpressionStatement
              let statement = node;
              while (statement.parent && statement.parent.type !== 'Program') {
                if (statement.parent.type === 'ExpressionStatement') {
                  statement = statement.parent;
                  break;
                }
                statement = statement.parent;
              }

              // Remove the entire statement including semicolon and newline
              return fixer.remove(statement);
            },
          });
        }
      },
    };
  },
};
