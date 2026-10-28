import { createHash } from "node:crypto";
import ts from "typescript";

/** Keep JSX elements, attributes, text, callbacks and action expressions intact.
 * Only CRLF and TypeScript type assertions are normalized. */
export function healthPagesJsxFingerprint(file: string, text: string): { count: number; sha256: string } {
  const source = ts.createSourceFile(file, text.replaceAll("\r\n", "\n"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const transformed = ts.transform(source, [context => {
    const visit: ts.Visitor = node => ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)
      ? ts.visitNode(node.expression, visit)
      : ts.visitEachChild(node, visit, context);
    return node => ts.visitNode(node, visit) as ts.SourceFile;
  }]);
  try {
    const jsx: string[] = [], printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
    function visit(node: ts.Node) {
      if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
        jsx.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
        return;
      }
      ts.forEachChild(node, visit);
    }
    visit(transformed.transformed[0]);
    return { count: jsx.length, sha256: createHash("sha256").update(JSON.stringify(jsx)).digest("hex") };
  } finally { transformed.dispose(); }
}
