# Align Args

Align arguments in repeated single-line function calls so they are easy to scan in columns.

This extension is meant for the kind of code or text where you have several similar calls in a row and want to compare values quickly.

## Release Status

- Latest version: `1.0.1`
- README and release notes were refreshed for the `1.0.1` release
- Full version history is available in [CHANGELOG.md](./CHANGELOG.md)

## What It Does

Turn this:

```c
// arg1, arg2, arg3, long_name, arg4
func(FALSE,1,0xABu,TRUE,SO);
func1(TRUE,10,0xFFu,FALSE,SOMEVAL);
func12(FALSE,100,0xABu,TRUE,SOMEVAL);
func1(TRUE,1000,0xCDu,FALSE,SOMEVALU);
func(FALSE,10000,0xEFu,TRUE,SOMEVALUE);
```

Into this:

```c
//    arg1  , arg2  , arg3  , long_name  , arg4
func  (FALSE ,     1 , 0xABu , TRUE  , SO       );
func1 (TRUE  ,    10 , 0xFFu , FALSE , SOMEVAL  );
func12(FALSE ,   100 , 0xABu , TRUE  , SOMEVAL  );
func1 (TRUE  ,  1000 , 0xCDu , FALSE , SOMEVALU );
func  (FALSE , 10000 , 0xEFu , TRUE  , SOMEVALUE);
```

## How It Works

- Uses VS Code signature help when the active language service can provide it.
- Falls back to a built-in parser when signature help is unavailable.
- Still works in plain text and other non-LSP documents.
- Keeps the focus on single-line call alignment rather than full document formatting.

The fallback parser understands nested `()`, `[]`, `{}` and quoted strings well enough to avoid splitting on commas inside them.

## Usage

1. Select the lines you want to align.
2. Run `Align Args` from the Command Palette.
3. Or right-click the selection and choose `Align Args`.

Command palette:

![Command Palette Demo](./images/commandpalette.gif?raw=true)

Context menu:

![Context Menu Demo](./images/contextmenu.gif?raw=true)

## Reference Comment Line

If the first selected line is a comma-separated comment, it will be aligned with the function calls below it.

Supported reference comment styles:

- `// arg1, arg2, arg3`
- `# arg1, arg2, arg3`
- `/* arg1, arg2, arg3 */`

This is useful when the call sites are repetitive and argument meaning is not obvious at a glance.

## Settings

`alignargs.alignDecimal`
- Alignment for decimal values: `left`, `center`, `right`

`alignargs.alignNonDecimal`
- Alignment for non-decimal values: `left`, `center`, `right`

`alignargs.formatHex`
- Normalizes hexadecimal arguments such as `0XabU` to `0xABu`

`alignargs.trimTrail`
- Trims leading and trailing whitespace inside each argument before aligning

`alignargs.padType`
- Uses `space` or `tab(experimental)` padding

`alignargs.replaceArg`
- Replaces exact argument values before alignment
- Default examples: `t -> TRUE`, `f -> FALSE`

## Tested Scenarios

Automated tests currently cover:

- JavaScript
- TypeScript
- TSX
- Python
- C
- C++
- C#
- Plain text

## Notes

- Best suited for repeated single-line calls.
- Multi-line call formatting is intentionally out of scope.
- If signature help is available for a language, argument detection is usually more accurate there.
- If signature help is not available, the fallback parser is used automatically.

## Release Notes

The `1.0.1` release refreshes the project documentation to match the current implementation and packaging flow.

See [CHANGELOG.md](./CHANGELOG.md) for full version history.
