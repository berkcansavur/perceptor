import * as fs from "fs";
import * as path from "path";

const enum TestFramework {
  Vitest = "vitest",
  Jest = "jest",
  Mocha = "mocha",
  NUnit = "nunit",
  XUnit = "xunit",
  JUnit = "junit",
  Unknown = "unknown",
}

type TestDiscoveryResult = {
  readonly testFile: string;
  readonly framework: TestFramework;
};

export type { TestDiscoveryResult, TestFramework };

export class TestDiscovery {
  findTestForClass(sourceFile: string, rootDir: string): TestDiscoveryResult | null {
    return this.findAllTestsForClass(sourceFile, rootDir)[0] ?? null;
  }

  // ALL existing test files for a class — a method's test may live beside the source
  // OR under perceptor-tests/ OR a parallel test dir, AND may be split per method
  // (`BasketService.addItem.test.ts`). So we SCAN each candidate dir for any file that
  // belongs to the class, rather than guessing fixed names. Coverage is the union.
  findAllTestsForClass(sourceFile: string, rootDir: string): TestDiscoveryResult[] {
    const ext = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, ext);
    const results: TestDiscoveryResult[] = [];
    const seen = new Set<string>();
    for (const dir of this.candidateDirs(sourceFile)) {
      let entries: string[];
      try {
        entries = fs.readdirSync(path.join(rootDir, dir));
      } catch {
        continue;
      }
      const inTestsDir = path.basename(dir) === "__tests__";
      for (const entry of entries) {
        const isTest = this.isTestFileForClass(entry, baseName, ext) || (inTestsDir && entry === `${baseName}${ext}`);
        if (!isTest) continue;
        const testFile = path.join(dir, entry);
        if (seen.has(testFile)) continue;
        seen.add(testFile);
        let framework = this.detectFramework(rootDir, sourceFile);
        if (framework === TestFramework.Unknown) {
          framework = this.detectFromTestFileImports(testFile, rootDir);
        }
        results.push({ testFile, framework });
      }
    }
    return results;
  }

  // The test file (among all candidates) whose describe/it titles actually name the
  // method — so per-method readiness picks the right file even when several exist.
  findTestCovering(sourceFile: string, rootDir: string, methodName: string): TestDiscoveryResult | null {
    for (const test of this.findAllTestsForClass(sourceFile, rootDir)) {
      if (this.findTestedMethods(test.testFile, rootDir, [methodName]).has(methodName)) {
        return test;
      }
    }
    return null;
  }

  findTestedMethods(
    testFile: string,
    rootDir: string,
    methodNames: readonly string[]
  ): ReadonlySet<string> {
    const absolutePath = path.join(rootDir, testFile);
    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      // A method is "tested" only when a describe/it/test TITLE names it — not when
      // its name merely appears somewhere (a mocked dependency `findById: jest.fn()`
      // or a helper call `basket.addItem(...)` would otherwise be false positives).
      const titles = this.extractSuiteTitles(content);
      const covered = new Set<string>();
      for (const methodName of methodNames) {
        if (titles.some((title) => this.titleNamesMethod(title, methodName))) {
          covered.add(methodName);
        }
      }
      return covered;
    } catch {
      return new Set();
    }
  }

  private extractSuiteTitles(content: string): string[] {
    const titles: string[] = [];
    const pattern = /\b(?:describe|it|test)\s*\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      if (match[2]) titles.push(match[2]);
    }
    return titles;
  }

  private titleNamesMethod(title: string, methodName: string): boolean {
    // Word-boundary match so "addItem" doesn't match "addItems"/"readItem".
    // Escape the method name — TS identifiers may contain `$`, a regex metachar.
    const escaped = methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^A-Za-z0-9_$])${escaped}([^A-Za-z0-9_$]|$)`).test(title);
  }

  extractTestPayload(
    testFile: string,
    rootDir: string,
    methodName: string,
    paramNames: readonly string[]
  ): Record<string, unknown> {
    const absolutePath = path.join(rootDir, testFile);
    const payload: Record<string, unknown> = {};
    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      const methodIndex = content.indexOf(methodName);
      if (methodIndex === -1) return payload;
      const blockStart = content.lastIndexOf("it(", methodIndex);
      const blockEnd = content.indexOf("})", methodIndex);
      const block = content.substring(
        blockStart > 0 ? blockStart : 0,
        blockEnd > 0 ? blockEnd : undefined
      );
      for (const paramName of paramNames) {
        const pattern = new RegExp(
          `(?:const|let|var)\\s+${paramName}\\s*=\\s*(.+?)\\s*;`
        );
        const match = pattern.exec(block);
        const captured = match?.[1];
        if (captured) {
          payload[paramName] = this.parseLiteral(captured.trim());
        }
      }
    } catch { /* test file unreadable — fall back to empty */ }
    return payload;
  }

  private parseLiteral(literal: string): unknown {
    if (literal.startsWith('"') || literal.startsWith("'") || literal.startsWith("`")) {
      return literal.slice(1, -1);
    }
    if (literal === "true") return true;
    if (literal === "false") return false;
    if (literal === "null") return null;
    if (literal === "[]") return [];
    if (literal === "{}") return {};
    const num = Number(literal);
    if (!isNaN(num)) return num;
    return null;
  }

  suggestTestPath(sourceFile: string, language: string): string {
    const dir = path.dirname(sourceFile);
    const ext = path.extname(sourceFile);
    const baseName = path.basename(sourceFile, ext);
    if (language === "csharp") return path.join(dir, `${baseName}Tests${ext}`);
    if (language === "java") return path.join(dir, `${baseName}Test${ext}`);
    return path.join(dir, `${baseName}.test${ext}`);
  }

  detectFramework(rootDir: string, sourceFile: string): TestFramework {
    const ext = path.extname(sourceFile);
    if (ext === ".cs") return this.detectDotnetFramework(rootDir);
    if (ext === ".java") return TestFramework.JUnit;
    return this.detectJsFramework(rootDir, sourceFile);
  }

  // Directories a class's test files could live in: beside the source, a sibling
  // __tests__, the mirrored perceptor-tests/ tree, and a parallel src→test dir.
  private candidateDirs(sourceFile: string): string[] {
    const dir = path.dirname(sourceFile);
    const dirs = [
      dir,
      path.join(dir, "__tests__"),
      path.join("perceptor-tests", dir),
      path.join("perceptor-tests", dir, "__tests__"),
    ];
    const testDir = dir.replace(/\bsrc\b/, "test").replace(/\bmain\b/, "test");
    if (testDir !== dir) {
      dirs.push(testDir, path.join(testDir, "__tests__"));
    }
    if (dir.startsWith("Assets/Scripts/") || dir.startsWith("Assets\\Scripts\\")) {
      dirs.push(dir.replace(/Assets[/\\]Scripts/, "Assets/Tests/Editor"));
    }
    return dirs;
  }

  // True for any test file belonging to `baseName`: `Name.test/.spec`, a per-method
  // split `Name.method.test`, or the suffix styles `NameTest`/`NameTests`/`Name_test`.
  private isTestFileForClass(fileName: string, baseName: string, ext: string): boolean {
    const b = baseName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const e = ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`^${b}(\\.[\\w-]+)*\\.(test|spec)${e}$|^${b}(Test|Tests|_test)${e}$`).test(fileName);
  }

  private detectJsFramework(rootDir: string, sourceFile: string): TestFramework {
    let dir = path.dirname(path.join(rootDir, sourceFile));
    while (dir.startsWith(rootDir)) {
      const detected = this.detectFromPackageJson(path.join(dir, "package.json"));
      if (detected !== TestFramework.Unknown) return detected;
      const parent = path.dirname(dir);
      if (parent === dir) break;
      dir = parent;
    }
    const rootDetected = this.detectFromPackageJson(path.join(rootDir, "package.json"));
    if (rootDetected !== TestFramework.Unknown) return rootDetected;
    return this.detectFromConfigFiles(rootDir);
  }

  private detectFromPackageJson(packageJsonPath: string): TestFramework {
    if (!fs.existsSync(packageJsonPath)) return TestFramework.Unknown;
    try {
      const content = fs.readFileSync(packageJsonPath, "utf-8");
      if (content.includes('"vitest"')) return TestFramework.Vitest;
      if (content.includes('"jest"')) return TestFramework.Jest;
      if (content.includes('"mocha"')) return TestFramework.Mocha;
    } catch { /* ignore */ }
    return TestFramework.Unknown;
  }

  private detectFromConfigFiles(rootDir: string): TestFramework {
    const vitestConfigs = ["vitest.config.ts", "vitest.config.js", "vitest.config.mts", "vite.config.ts"];
    const jestConfigs = ["jest.config.ts", "jest.config.js", "jest.config.mjs", "jest.config.json"];
    const mochaConfigs = [".mocharc.yml", ".mocharc.yaml", ".mocharc.json", ".mocharc.js"];
    for (const config of vitestConfigs) {
      if (fs.existsSync(path.join(rootDir, config))) return TestFramework.Vitest;
    }
    for (const config of jestConfigs) {
      if (fs.existsSync(path.join(rootDir, config))) return TestFramework.Jest;
    }
    for (const config of mochaConfigs) {
      if (fs.existsSync(path.join(rootDir, config))) return TestFramework.Mocha;
    }
    return this.detectFromNodeModules(rootDir);
  }

  private detectFromNodeModules(rootDir: string): TestFramework {
    const modulesDir = path.join(rootDir, "node_modules");
    if (fs.existsSync(path.join(modulesDir, "vitest"))) return TestFramework.Vitest;
    if (fs.existsSync(path.join(modulesDir, "jest"))) return TestFramework.Jest;
    if (fs.existsSync(path.join(modulesDir, "mocha"))) return TestFramework.Mocha;
    return TestFramework.Unknown;
  }

  private detectFromTestFileImports(testFile: string, rootDir: string): TestFramework {
    const absolutePath = path.join(rootDir, testFile);
    try {
      const content = fs.readFileSync(absolutePath, "utf-8");
      if (content.includes("from \"vitest\"") || content.includes("from 'vitest'")) return TestFramework.Vitest;
      if (content.includes("from \"@jest/globals\"") || content.includes("from '@jest/globals'")) return TestFramework.Jest;
      if (content.includes("from \"mocha\"") || content.includes("from 'mocha'")) return TestFramework.Mocha;
      if (content.includes("require(\"vitest\")") || content.includes("require('vitest')")) return TestFramework.Vitest;
      if (content.includes("require(\"mocha\")") || content.includes("require('mocha')")) return TestFramework.Mocha;
      if (content.includes("describe(") && content.includes("it(")) {
        return TestFramework.Jest;
      }
    } catch { /* ignore */ }
    return TestFramework.Unknown;
  }

  private detectDotnetFramework(rootDir: string): TestFramework {
    try {
      const entries = fs.readdirSync(rootDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith(".csproj")) continue;
        const content = fs.readFileSync(path.join(rootDir, entry.name), "utf-8");
        if (content.includes("NUnit")) return TestFramework.NUnit;
        if (content.includes("xunit") || content.includes("xUnit")) return TestFramework.XUnit;
      }
    } catch { /* ignore */ }
    return TestFramework.Unknown;
  }
}
