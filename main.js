var language = brackets.getLocale().substr(0,2);

define(function(require, exports, module) {
     "use strict";
 
    var KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
    EditorManager = brackets.getModule("editor/EditorManager"),
    DocumentManager = brackets.getModule("document/DocumentManager"),
    ExtensionUtils = brackets.getModule("utils/ExtensionUtils");

    var ExtPath = ExtensionUtils.getModulePath(module);
    
    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");
 
    
    function inlineProvider(hostEditor, pos) {
        // get editor content
        var currentDoc = DocumentManager.getCurrentDocument().getText();
       
        // get programming language
        var langId = hostEditor.getLanguageForSelection().getId();
        
        // Only provide docs when cursor is in javascript content
        if (langId !== "javascript") {
            return null;
        }
        
        // no multiline selection
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }
        
        
        
        // get func.name and func.type ('.' or 'Math.')
        var func = get_func_name(currentDoc,sel.start);
        
        // if a function was selected
        if (func) {
            var func_class,url;          
            
            switch(func.type) {
                case ".": // string or Array
                    // if variable type is unknown
                    if (func.variable_type == 'unknown') { 
                        var tags = getTags(func,"String");
                        func_class = "Global_Objects/String";
                        if (!tags) { // try array functions
                            var tags = getTags(func,"Array");
                            func_class = "Global_Objects/Array";
                        } 
                        if (!tags) { // try RegExp functions
                            var tags = getTags(func,"RegExp");
                            func_class = "Global_Objects/RegExp";
                        }
                    } else { // if variable type is defined
                        var tags = getTags(func,func.variable_type);
                        func_class = "Global_Objects/"+func.variable_type;
                    }
                    break;
                case "Math.": // Math functions
                    var tags = getTags(func,"Math");
                     func_class = "Global_Objects/Math";
                    break;
                case "RegExp.": // RegExp functions
                    var tags = getTags(func,"RegExp");
                     func_class = "Global_Objects/RegExp";
                    break;
                default:
                    var tags = getTags(func,"Statements"); 
                    func_class = "Statements";
                    if (!tags) {
                        var tags = getTags(func,"global");
                        func_class = "Global_Objects";
                    }
            }
                
            // if tags are available 
            if (tags) {
                if (tags.s != "" || tags.p) {
                    var summary = tags.s;
                    var syntax = tags.y.replace(/\n/g,'<br>');
        
                    // check if function has parameters
                    if (tags.p) { 
                        var parameters = tags.p;
                    } else {
                        var parameters = eval("[{}]");   
                    }
                    // if___else and some other functions back to if...elese
                    func.name = func.name.replace(/___/,'...');
                    // generate url for read more
                    url = func_class+'/'+func.name;
                    
                    var result = new $.Deferred();
                    var inlineWidget = new InlineDocsViewer(func.name,{SUMMARY:summary, SYNTAX: syntax, URL:url, VALUES:parameters});
                    inlineWidget.load(hostEditor);
                    result.resolve(inlineWidget);
                    return result.promise();
                }
            }
        } 
        return null;
    }
    
    function getTags(func,type) {
        // Initialize the Ajax request
        var xhr = new XMLHttpRequest();
        
        // open json file (synchronous) 
        xhr.open('get', ExtPath+'docs/'+type+'.json', false);
            
        // Send the request 
        xhr.send(null);

        if(xhr.status === 0){
            // function information is available
            var tags = JSON.parse(xhr.responseText);
            tags = eval('tags.'+func.name);
            // if the function exists
            if (tags) {
                return tags;
            }
        }
        
        return null;
    }
    
    function get_func_name(content,pos) {
        // get the content of each line
        var lines = content.split("\n");
        // get the content of the selected line
        var line = lines[pos.line];
        // get string after current position
        var line_after = line.substr(pos.ch);
        // get string before current position
        var line_begin = line.substr(0,pos.ch);
        // reverse the string before current position
        var line_begin_rev = reverse(line_begin);
        
        
        // characters which can be part of a function name
        var function_chars = '0123456789abcdefghijklmnopqrstuvwxyz_';
        
        var e = 0;
        while (function_chars.indexOf(line_after.substr(e,1).toLowerCase()) !== -1 && e < line_after.length) {
            e++;
        }
        
        var b = 0;
        while (function_chars.indexOf(line_begin_rev.substr(b,1).toLowerCase()) !== -1 && b < line_begin_rev.length) {
            b++;
        }
        
        // characters which can't be directly before the function_name
        var no_function_chars = '0123456789$';
        if (no_function_chars.indexOf(line_begin_rev.substr(b,1)) === -1 || b == line_begin_rev.length) {
            var func = new Object();
            func.name = line.substr(pos.ch-b,b+e);
            // check if function is like abc.substr or only like eval (no point)
            if (line_begin_rev.substr(b,1) == ".") {
                func.type = ".";   
                if (line_begin_rev.substr(b,5) == ".htaM") { // Math. reverse
                    func.type = "Math.";
                }
                if (line_begin_rev.substr(b,7).search(/\.'(g|m|i|y){0,4}\//) !== -1) { // regex with g,m,i,y flags reverse
                    func.type = "RegExp.";
                }
                // if it is no Math or RegExp function => try to get the type
                if (func.type == ".") {
                    // get the variable name (i.e strname.indexOf => variable name = "strname")
                    // characters which can't be part of a variable name
                    var no_variable_chars = ' =,+-(';
                    var v = b+1;
                    while (no_variable_chars.indexOf(line_begin_rev.substr(v,1).toLowerCase()) === -1 && v < line_begin_rev.length) {
                        if (line_begin_rev.substr(v,1).toLowerCase() == ')') {
                            no_variable_chars = ''; // inside brackets everything is possible :D 
                        }
                        if (line_begin_rev.substr(v,1).toLowerCase() == '(') {
                            no_variable_chars = ' =,+-('; // old no_variable_chars
                        }
                        v++;
                    }
                    // func.variable could look like abc.substr(0,1) if the function was abc.substr(0,1).indexOf('') 
                    func.variable = line.substr(pos.ch-v,v-b-1);
                    // console.log('func.variable1: ' + func.variable);
                    // delete function names inside func.variables
                    // split variable into parts
                    var func_variable_parts = func.variable.split(".");
                    // the first part can't be a function
                    func.variable = func_variable_parts[0];
                    // iterate through all other parts
                    for (var i = 1; i < func_variable_parts.length; i++) {
                        // if part has no parmaters and isn't 'lengt' => part of variable 
                        if (func_variable_parts[i].indexOf('(') === -1 && func_variable_parts[i] !== "length") {
                            func.variable += '.'+func_variable_parts[i];
                        } else {
                            // if part is function => next part must be a function as well
                            break;
                        }
                    }
                    // console.log('func.variable2: ' + func.variable);
                    var var_param = func.variable.indexOf('[');
                    // if variable is sth like abc[i] it can be an array or a string
                    if (var_param !== -1) {
                        // can be string and array
                        func.variable_type = 'unknown';
                    } else {
                         // try to get the VariableType ('String','Array','RegExp','unknown'
                        func.variable_type = getVariableType(content,func.variable);     
                    }
                   
                    // console.log('func.variable_type: ' + func.variable_type);
                }
            } else {
                // some function names have different options
                switch(func.name) {
                    case "for":
                        if (line_after.indexOf(' of ') !== -1) {
                            func.name = "for___of";
                        }
                        if (line_after.indexOf(' in ') !== -1) {
                            func.name = "for___in";
                        }
                        break;
                    case "if":
                        func.name = "if___else";
                        break;
                    case "try":
                        func.name = "try___catch";
                        break;
                    case "do":
                        func.name = "do___while";
                        break;
                }
            }
            return func;
        }
        
        return null;
    }
    
    // returns unknown,String,Array or RegExp
    function getVariableType (content, variable) {
        // get the declaration for this variable
        var regex = new RegExp('var\\s(.*?)'+variable+'\\s(.*?)=');
        // console.log(regex);
        var pos = content.search(regex);
        // if the declaration is not available in this content
        if (pos === -1) { return 'unknown'; }
        // get declaration value
        var value = content.substring(pos,content.indexOf(";",pos));
        value = value.substr(value.indexOf('=')+1).trim();
        // split the declaration into parts
        var value_parts = value.split(".");
        // if the declaration is like variablename.function[.function,...]
        if (value_parts.length >= 2) {
            // iterate through the parts starting with the functions
            for (var i = 1; i < value_parts.length; i++) {
                // get positon of the parameter part for this function
                var func_param_pos = value_parts[i].indexOf('(');
                // if the function has parameter => get function name
                if (func_param_pos !== -1) {
                    var func = value_parts[i].substr(0,func_param_pos);
                } else {
                    var func = value_parts[i];   
                }
                // all functions that outputs a string
                var makes_string = ',substr,substring,search,concat,replace,trim,big,blink,bold,';
                makes_string += 'fixed,fontcolor,fontsize,italics,link,small,strike,sub,sup,join,pop,push,';
                if (makes_string.indexOf(','+func+',') !== -1) {
                    return 'String';
                }
                // all functions that outputs an array
                if (',split,reverse,sort,map,'.indexOf(','+func+',') !== -1) {
                    return 'Array';
                }
            }
        } else { // if the declaration has no function parts
            // array can be declared with new Array or []
            if (value.indexOf('new Array') !== -1 || (value.substr(0,1) == '[' && value.substr(-1,1) == ']') ) {
                return 'Array';   
            }
            if (value.indexOf('new RegExp') !== -1) {
                return 'RegExp';   
            }
            // checks '/anc/flags' and "/anc/flags" => RegExp
            var regex_end = new RegExp("\/(g|m|i|y){0,4}'");
            var regex_end2 = new RegExp('\/(g|m|i|y){0,4}"');
            if ((value.substr(0,2) == "'/" && value.substr(-6,6).search(regex_end) !== -1) ||
               (value.substr(0,2) == '"/' && value.substr(-6,6).search(regex_end2) !== -1)) {
                return 'RegExp';
            }
            
            // checks 'str' and "str"
            if ((value.substr(0,1) == "'" && value.substr(-1,1) == "'") || (value.substr(0,1) == '"' && value.substr(-1,1) == '"')) {
                return 'String';
            }
        }
        return 'unknown';                                     
    }
    
    // reverse a string
    function reverse(s){
        return s.split("").reverse().join("");
    }
    

    
    EditorManager.registerInlineDocsProvider(inlineProvider); 
});