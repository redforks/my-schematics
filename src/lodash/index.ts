import { Rule, SchematicContext, Tree } from '@angular-devkit/schematics';
import * as ts from 'typescript';
import { Path } from '@angular-devkit/core';
import { readFileSync } from 'fs';
import { removeAt, insertAt } from "tsmisc";

function loadSourceFile(p: Path): ts.SourceFile {
  return ts.createSourceFile(
    p,
    readFileSync(p.substr(1)).toString(),
    ts.ScriptTarget.Latest,
    /*setParentNodes */ true,
  );
}

// return true if changed
function translate(f: ts.SourceFile): string {
  let updated = f.text;
  let sourceOffset = 0;
  function travel(n: ts.Node) {
    if (ts.isImportDeclaration(n)) {
      if (ts.isStringLiteral(n.moduleSpecifier) && n.moduleSpecifier.text === 'lodash') {
        let newImports: string[] = [];
        if (n.importClause && n.importClause.namedBindings && ts.isNamedImports(n.importClause.namedBindings)) {
          let namedBindings = n.importClause.namedBindings;
          for (const binding of namedBindings.elements) {
            let detailImport = ts.createImportDeclaration(undefined, undefined,
              ts.createImportClause(
                ts.createIdentifier(binding.name.text),
                undefined,
              ),
              ts.createStringLiteral('lodash/' + binding.name.text));
            newImports.push(dumpNode(detailImport, f).replace(/"/g, "'"));
          }
        }
        let updatedCode = '\n' + newImports.join('\n');
        updated = removeAt(updated, n.pos + sourceOffset, n.end - n.pos);
        updated = insertAt(updated, n.pos + sourceOffset, updatedCode);
        sourceOffset += updatedCode.length - (n.end - n.pos);
      }
    }
  }

  ts.forEachChild(f, travel);
  if (updated !== f.text) {
    return updated;
  }
  return '';
}

function dumpNode(n: ts.Node, f: ts.SourceFile) {
  const printer = ts.createPrinter({
    newLine: ts.NewLineKind.LineFeed,

  });
  return printer.printNode(ts.EmitHint.Unspecified, n, f)
}

// You don't have to export the function as default. You can also have more than one rule factory
// per file.
export function lodash(_options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    tree.getDir('/src').visit(v => {
      if (v.endsWith('.ts')) {
        let f = loadSourceFile(v);
        let translated = translate(f);
        if (translated) {
          tree.overwrite(v, translated);
        }
      }
    });

    let tsConfig = JSON.parse(readFileSync('tsconfig.json').toString());
    if (!tsConfig.compilerOptions) {
      tsConfig.compilerOptions = {};
    }
    if (!tsConfig.compilerOptions.allowSyntheticDefaultImports) {
      tsConfig.compilerOptions.allowSyntheticDefaultImports = true;

      tree.overwrite('/tsconfig.json', JSON.stringify(tsConfig, undefined, 2));
    }

    return tree;
  };
}
