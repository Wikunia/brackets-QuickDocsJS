# QuickDocsJS
This extension provides a quick documentation to each JavaScript function.

## How to use
You can use the Navigation menu or ```Ctrl+K``` (Windows) or ```CMD+K``` (Mac), while your cursor is on a JavaScript function, to open the inline documentation.

![Example](image/example.png?raw=true)

This extension uses the documentation from [http://developer.mozilla.org](http://developer.mozilla.org).

## v 1.4.1
QuickDocsJS can use require.js `define` statements to get docs by reading other modules.
[#8](../../issues/8)


## v 1.4
QuickDocsJS supports prototype functions:
```javascript
/**
 * split a string into an array with limit entries
 * The last entry contains the last part of the string, which can contain the separator)
 * @param separator {string} string separator
 * @param limit {integer} number of entries in the array
 * @return array of separated strings
 */
String.prototype.splitLimit = function(separator,limit) {
	var splitString = this;
	var result = [];
	var pos = splitString.search(separator);
	if (pos < 0) return false;
	result.push(splitString.substring(0,pos));
	result.push(splitString.substring(pos+1));
	return result;
}


```

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
