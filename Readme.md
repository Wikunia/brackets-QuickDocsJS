# QuickDocsJS
This extension provides a quick documentation to each JavaScript function.

## How to use
You can use the Navigation menu or ```Ctrl+K```, while your cursor is on a JavaScript function, to open the inline documentation.

![Example](image/example.png?raw=true)

This extension uses the documentation from [http://developer.mozilla.org](developer.mozilla.org).

## v 1.2
It's now possible to get documentations for your own functions using JavaDoc.
```
    /**
        get the type of a variable
        @param content content of document
        @param variable name of the variable
        @return type of the variable: unknown,String,Array or RegExp
    */
    function getVariableType (content, variable) {
```

![User functions](image/user_func.png?raw=true)

##Languages
+ English

### License
Creative Commons v2.5
[http://creativecommons.org/licenses/by/2.5/](http://creativecommons.org/licenses/by/2.5/)
