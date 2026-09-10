import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

describe("ExtendScript syntax compatibility (ES3 / Premiere Pro)", () => {
  const hostPath = "cep/AutoCap/jsx/host.jsx";
  const code = readFileSync(hostPath, "utf8");

  it("contains no modern optional chaining or nullish coalescing operators", () => {
    // Basic regex checks for easy spotting
    expect(code).not.toMatch(/\?\./);
    expect(code).not.toMatch(/\?\?/);
  });

  it("is fully compliant with ES3 AST (no let, const, arrow, async, template literals, etc.)", () => {
    const sourceFile = ts.createSourceFile("host.jsx", code, ts.ScriptTarget.ES3, true);
    const violations: string[] = [];

    function walk(node: ts.Node) {
      if (ts.isVariableDeclarationList(node)) {
        if (node.flags & ts.NodeFlags.BlockScoped) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
          violations.push(`Block-scoped variable (let/const) at line ${line + 1}`);
        }
      }
      if (ts.isArrowFunction(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`Arrow function at line ${line + 1}`);
      }
      if (ts.isClassDeclaration(node) || ts.isClassExpression(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`Class declaration at line ${line + 1}`);
      }
      if (ts.isPropertyAccessChain(node) || ts.isElementAccessChain(node) || ts.isCallChain(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`Optional chaining (?.) at line ${line + 1}`);
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`Nullish coalescing (??) at line ${line + 1}`);
      }
      if (ts.isTemplateExpression(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`Template literal at line ${line + 1}`);
      }
      if (ts.isSpreadElement(node) || ts.isSpreadAssignment(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`Spread operator (...) at line ${line + 1}`);
      }
      if (ts.isForOfStatement(node)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
        violations.push(`For..of loop at line ${line + 1}`);
      }

      ts.forEachChild(node, walk);
    }

    walk(sourceFile);
    expect(violations).toEqual([]);
  });
});

