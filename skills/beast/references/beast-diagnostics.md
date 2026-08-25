# Beast diagnostics

The native Beast compiler is the diagnostic authority. Parser and generator failures throw `BeastCompileError` with a stable code, severity, message, filename, and `SourceSpan { start: { offset, line, column }, end }`. The CLI also prints the source line and a caret.

Fix the `.btsx` source at the reported span. Generated TSRX is useful for inspection, but it is not the source of truth.

## Layout and logical lines

| Code | Cause | Fix |
| --- | --- | --- |
| `BEAST1001_INVALID_INDENT` | first content line is indented | start the first declaration or node at column 1 |
| `BEAST1002_UNEXPECTED_INDENT` | line is deeper than the surrounding block permits | align it with its siblings or give it a valid parent |
| `BEAST1003_TAB_INDENT` | tab appears in indentation | replace indentation tabs with spaces |
| `BEAST1004_ORPHAN_CONTINUATION` | `~` has no preceding authored line or is not indented beneath it | indent it more deeply than the line being continued or remove it |

Two spaces is conventional, not a parser-wide fixed width. Siblings must share an indentation level and a child must be deeper than its parent.

A continuation line must start with `~` after its leading spaces and be deeper than its predecessor. Beast drops `~`-only and `~ // comment` continuations; any other payload is joined to the preceding authored line with one space. This applies to template lines and preserved `module`, `setup`, and `style` source. Continuation fragments retain their own physical source locations for mappings and diagnostics.

## Declarations and local components

| Code | Cause | Fix |
| --- | --- | --- |
| `BEAST1501_DUPLICATE_PROPS` | component declares props twice | keep one complete function parameter |
| `BEAST1502_EMPTY_PROPS` | `props` has no parameter | add a typed parameter, commonly `props { value }: Props` |
| `BEAST1503_MISPLACED_DECLARATION` | import/module/component/props/setup follows template content | move all declarations before the first template node |
| `BEAST1504_EMPTY_IMPORT` | bare `import` | add the complete TypeScript import on the same logical line |
| `BEAST1505_EMPTY_SETUP` | block `setup` has no indented TypeScript | add source or remove the declaration |
| `BEAST1506_EMPTY_MODULE` | block `module` has no indented TypeScript | add source or remove the declaration |
| `BEAST1801_INVALID_COMPONENT_NAME` | local name is missing or not one PascalCase identifier | use `component Card` |
| `BEAST1802_EMPTY_COMPONENT` | local component has no indented body | add its declarations/template |
| `BEAST1803_EMPTY_COMPONENT_TEMPLATE` | local component has declarations but no template node | add at least one rendered node |

`module` and `setup` accept inline or indented raw TypeScript. Octane performs final TypeScript validation.

## Elements, attributes, and text

| Code | Cause | Fix |
| --- | --- | --- |
| `BEAST1101_INVALID_SELECTOR` | empty/malformed selector or shorthand | use a native tag, `.class`, `#id`, or valid component reference |
| `BEAST1102_INVALID_ELEMENT` | unexpected characters immediately after selector | put attributes in `(...)` and separate inline text with whitespace |
| `BEAST1103_DUPLICATE_ID` | selector contains two ID shorthands | keep one `#id` |
| `BEAST1201_UNCLOSED_ATTRIBUTES` | attribute list lacks `)` | close it on the line or continue the logical line with `~` |
| `BEAST1202_INVALID_ATTRIBUTE` | invalid name/value, empty expression, or non-spread braces | quote strings, brace expressions, and use `{...value}` for spreads |
| `BEAST1203_UNCLOSED_INTERPOLATION` | `#{...}` lacks `}` | close the TypeScript expression |
| `BEAST1204_EMPTY_INTERPOLATION` | `#{}` contains no expression | add an expression or use literal text |
| `BEAST2002_DUPLICATE_ID` | `#id` is combined with explicit `id=` | choose shorthand or explicit ID |
| `BEAST2003_DUPLICATE_CLASS` | more than one explicit `class`/`className` | keep one; selector classes can combine with it |

Quoted attributes and literal text decode HTML entities. If Octane rejects an embedded expression, repair the TypeScript expression in BTSX.

## Control flow and composition

| Codes | Cause | Fix |
| --- | --- | --- |
| `BEAST1301`–`BEAST1305` | orphan/empty/duplicate `if`, `elseif`, or `else` arm | keep adjacent aligned branches with a condition and body |
| `BEAST1401`–`BEAST1408` | malformed `each`, binding, iterable, key, or `empty` arm | use `each item[, index] in iterable [key expr]`; align one non-empty `empty` arm |
| `BEAST1601`–`BEAST1607` | malformed `switch`, `case`, or `default` | nest non-empty arms directly under switch; keep one default |
| `BEAST1701`–`BEAST1711` | malformed `try`, `pending`, or `catch` | use bare `try`, then non-empty `pending` and/or `catch`; pending precedes catch |
| `BEAST1901_EMPTY_FRAGMENT` | explicit fragment has no nodes | add an indented template node or remove it |
| `BEAST1902_EMPTY_STYLE` | style block has no CSS | add indented CSS or remove it |

Specific boundary rules:

- `empty` immediately follows its `each` at the same indentation.
- `case`/`default` are direct children of `switch`.
- `try` has no header expression and requires `pending`, `catch`, or both.
- `pending` has no header; catch bindings may be bare or in one balanced pair of parentheses.

## Diagnose in order

1. Run the native compiler and read the code plus `span`:

   ```bash
   bunx beast compile src/App.btsx --output /tmp/App.tsrx
   ```

2. Check the authored shape in `references/beast-syntax-cheatsheet.md`.
3. Recompile and inspect the generated TSRX only where it clarifies the failure.
4. If a recursive build fails, run `bunx beast build src --out-dir .beast` without watch first.
5. If the bundler fails, check the matching adapter in `references/beast-build-tools.md`, then run the project's TSRX-aware typecheck and production build.

Downstream Octane diagnostics may originate in generated TSRX, but Vite/Rspack source maps can trace them to BTSX. Patch BTSX, then rebuild.

## Skill doctor boundary

`scripts/beast-doctor.cjs` is a dependency-free lexical triage tool. It bounds reads to 4 MiB, skips common build/vendor directories, and never imports or executes target modules. Its `empty-body`, `indentation`, and similar hints are not native `BEAST####_*` diagnostics and can be incomplete. Prefer Beast plus Octane whenever project dependencies are available.
