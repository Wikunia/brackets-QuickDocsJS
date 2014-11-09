# QuickDocsJS
This extension provides a quick documentation for each JavaScript function.
It supports JSDoc comments since v1.2 and some requirejs stuff (v1.4) which allows you to access documentations which aren't in the same file!
You don't use normal JS but jQuery or NodeJS? QuickDocs supports both of them (v1.5 & v1.6). 

**Miss some docs for standard functions or JS extensions like jQuery? Add them here [issue (#12)](../../issues/12). Thanks for your help!**

QuickDocsJS makes it easy to read your JSDoc comments inline, but you have to write these comments...

...Maybe you want to check out my [FuncDocr](https://github.com/Wikunia/brackets-FuncDocr) extension to generate JSDocs for your own functions.

## Type Recognition Magic

The extension tries to get the correct documentation if the function is available for strings and arrays.

```javascript
var abc = 'abc';
var pos = abc.indexOf('a'); // the documentation for String.indexOf 
var parts = abc.split('');
pos = parts.indexOf('a'); // the documentation for Array.indexOf
```

## How to use
You can use the Navigation menu or ```Ctrl+K``` (Windows) or ```CMD+K``` (Mac), while your cursor is on a JavaScript function, to open the inline documentation.

![Example](image/example.png?raw=true)

This extension uses the documentation from [http://developer.mozilla.org](http://developer.mozilla.org) for JS functions and [http://nodejs.org](http://nodejs.org) for NodeJS functions.

Since v1.6.0 QuickDocs supports jQuery! Thanks [http://api.jquery.com](http://api.jquery.com)

## v 1.6.0
Support for jQuery!
![jQuery](image/jQuery.png?raw=true)
`@link`-tags are parsed as HTML links now and you can use them to jump easy between functions!

## v 1.5.0
Support for NodeJS!
![NodeJS](image/nodeJS.png?raw=true)

## v 1.4.1
QuickDocsJS can use require.js `define` statements to get docs by reading other modules.
[#8](../../issues/8)


## v 1.4
QuickDocsJS supports prototype functions:
```javascript
/**
 * split a string into an array with limit entries
 * The last entry contains the last part of the string, which can contain the separator)
 * @param {String} separator string separator
 * @param {Integer} limit number of entries in the array
 * @return {Array} array of separated strings
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
It's now possible to get documentations for your own functions using JSDoc.
```
    /**
        get the type of a variable
        @param {String} content content of document
        @param {String} variable name of the variable
        @returns {String} type of the variable: unknown,String,Array or RegExp
    */
    function getVariableType (content, variable) {
```

![User functions](image/user_func.png?raw=true)



##Languages
+ English

### License
Creative Commons v2.5
[http://creativecommons.org/licenses/by/2.5/](http://creativecommons.org/licenses/by/2.5/)
