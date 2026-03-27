# AlignArgs README

Align arguments in function calls.

Works on single-line function calls and keeps the original goal of making repeated call sites easier to scan in columns.
The formatter uses the active language service signature help when available, and falls back to local parsing for plain text and languages without signature help.


# Usage

Select function calls,

option 1) Open command palette, type 'align args' and press enter.
![Demo](./images/commandpalette.gif?raw=true)


option 2) Right click on selected text, click 'align args' on context menu.
![Demo](./images/contextmenu.gif?raw=true)


(Optional) Reference comment line
You can list argument names in the first comment line and they will be aligned together with the selected calls.

# Features
Format hex (`0XabU` => `0xABu`)
Left/Center/Right align for decimal values
Left/Center/Right align for non-decimal values
Replace arguments
Optional reference comment alignment
LSP-backed call detection through signature help instead of the old handwritten parser
