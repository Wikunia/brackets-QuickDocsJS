var language = brackets.getLocale().substr(0,2);

define(function(require, exports, module) {
     "use strict";
 
    var KeyBindingManager = brackets.getModule("command/KeyBindingManager"),
    EditorManager = brackets.getModule("editor/EditorManager"),
    DocumentManager = brackets.getModule("document/DocumentManager"),
    ExtensionUtils = brackets.getModule("utils/ExtensionUtils"),
	FileSystem          = brackets.getModule("filesystem/FileSystem"),
	FileUtils           = brackets.getModule("file/FileUtils"),
	ProjectManager          = brackets.getModule("project/ProjectManager");

    var ExtPath = ExtensionUtils.getModulePath(module);
    
    // Extension modules
    var InlineDocsViewer = require("InlineDocsViewer");
 
    
    function inlineProvider(hostEditor, pos) {
		var result = new $.Deferred();

        // get editor content
        var currentDoc = DocumentManager.getCurrentDocument().getText();
       
		var docDir = FileUtils.getDirectoryPath(hostEditor.document.file.fullPath);
        // get programming language
        var langId = hostEditor.getLanguageForSelection().getId();
        
        // Only provide docs when cursor is in javascript content
        if (langId !== "javascript" && langId !== "coffeescript" && langId !== "livescript") {
            return null;
        }
        
        // no multiline selection
        var sel = hostEditor.getSelection();
        if (sel.start.line !== sel.end.line) {
            return null;
        }
        
        var currentMod = getCurrentModuleDir(docDir,currentDoc);
		console.log('currentMod: '+currentMod);
        
        // get func.name and func.type ('.' or 'Math.')
        var func = get_func_name(currentDoc,sel.start);
		console.log(func);

        // if a function was selected
        if (func) {
            var func_class,url;
			var tags = false;
            if (!("mod" in func)) {
				switch(func.type) {
					case ".": // string or Array
						// if variable type is unknown
						if (func.variable_type == 'unknown') {
							tags = getTags(func,"String");
							func_class = "Global_Objects/String";
							if (!tags) { // try array functions
								tags = getTags(func,"Array");
								func_class = "Global_Objects/Array";
							}
							if (!tags) { // try RegExp functions
								tags = getTags(func,"RegExp");
								func_class = "Global_Objects/RegExp";
							}
						} else if (func.variable_type != "this") { // if variable type is defined but not this
							tags = getTags(func,func.variable_type);
							func_class = "Global_Objects/"+func.variable_type;
						}
						break;
					case "Math.": // Math functions
						tags = getTags(func,"Math");
						 func_class = "Global_Objects/Math";
						break;
					case "RegExp.": // RegExp functions
						tags = getTags(func,"RegExp");
						 func_class = "Global_Objects/RegExp";
						break;
					default:
						tags = getTags(func,"Statements");
						func_class = "Statements";
						if (!tags) {
							tags = getTags(func,"global");
							func_class = "Global_Objects";
						}
				}

				// if tags for JS functions aren't available
				if (!tags) {
					// => check current document for user defined function
					var tags = get_userdefined_tags(currentDoc,func);
					func_class = 'user_defined';
				}
				if (tags) {
					if (tags.s != "" || tags.p) {
						var url = func.name;
						var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
						inlineViewer.done(function(inlineWidget) {
							console.log(inlineWidget);
							result.resolve(inlineWidget);
						});
					}
				}

			} else {
				var modContent = getModuleContent(docDir,func.mod,currentMod);
				modContent.done(function(content) {
					var tags = get_userdefined_tags(content,func);
					if (tags) {
						console.log(tags);
						if (tags.s != "" || tags.p) {
							var url = func.name;
							var inlineViewer = sendToInlineViewer(hostEditor,tags,func,url);
							inlineViewer.done(function(inlineWidget) {
								console.log(inlineWidget);
								result.resolve(inlineWidget);
							});
						}
					} else return null;
				}).fail(function() {
					console.log('fail');
					return null;
				});
			}

			if (result.state() == "rejected") {
				console.log('rejected');
				return null;
			}
			return result.promise();

        } else {
        	return null;
		}


		function sendToInlineViewer(hostEditor,tags,func,url) {
			if (tags.s != "" || tags.p) {
				var summary = tags.s;
                    var syntax = tags.y.replace(/\n/g,'<br>');
                    // indent code if it has space(s) at the beginning of the line
                    syntax = syntax.replace(/<br>\s(.*?).(.*?)(<br>|$)/g,'<br><p style="margin:0 auto; text-indent:2em;">$2</p>');

                    
                    // check if function has parameters
                    if (tags.p) { 
                        var parameters = tags.p;
                    } else {
                        var parameters = eval("[{}]");   
                    }
                    // if___else and some other functions back to if...elese
                    func.name = func.name.replace(/___/,'...');
                    
                    // generate url for read more if func_class isn't user_defined
                    if (func_class !== 'user_defined') {
                        url = func_class+'/'+func.name;
                    } else {
                        url = null;
                    }

					if (tags.r) {
						if (typeof tags.r.d == 'undefined') {
							tags.r = {d:tags.r,type:''};
						}
					} else {
						tags.r = {};
					}


                    // console.log(syntax);
                    var result = new $.Deferred();
                    var inlineWidget = new InlineDocsViewer(func.name,{SUMMARY:summary, SYNTAX: syntax, RETURN: tags.r, URL:url, VALUES:parameters});
                    inlineWidget.load(hostEditor);
                    result.resolve(inlineWidget);
                    return result.promise();
			}
		}
    }
    
    /**
    * Read the type.json file and return tags
    * @param func {string} function name
    * @param type {string} function type ('String','Array','Math','RegExp','global','Statements')
    * @return tags if the function exists, null otherwiese
    */
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


    /**
        Gets the function name and the type of the function
        @param content  {string} content of document
        @param pos      {Object} cursor position (pos.ch and pos.line)
        @return object (func.name,func.type,func.variable,func.variable_type)
    */
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
        var line_begin_rev = reverse_str(line_begin);
        
        
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
        
        var func_start_pos = pos.ch-b;
        var func_name_length = b+e;
        
        // console.log(line_after.substr(e,1));
        // if the cursor is not on the function name but on the part before the dot
        if (line_after.substr(e,1) === "[") {
            while (line_after.substr(e,1) !== ']') {
                e++;   
            }
            // not matching the ] but the char afterwards
            e++;
        }
        
        
        // Check if a dot is after the function name
        if (line_after.substr(e,1) === ".") {
            e++;
            // new start position
            func_start_pos = e+pos.ch;
            
            
            line_after = line.substr(e+pos.ch);
            // get string before current position
            line_begin = line.substr(0,e+pos.ch);
            // reverse the string before current position
            line_begin_rev = reverse_str(line_begin);
            
            // console.log(line_after);
            // console.log(line_begin);
            e = 0;
            while (function_chars.indexOf(line_after.substr(e,1).toLowerCase()) !== -1 && e < line_after.length) {
                e++;
            }
            // new function length
            func_name_length = e;
            b = 0;
        }
        
        
        // characters which can't be directly before the function_name
        var no_function_chars = '0123456789$';
        if (no_function_chars.indexOf(line_begin_rev.substr(b,1)) === -1 || b == line_begin_rev.length) {
            var func = new Object();
            func.name = line.substr(func_start_pos,func_name_length);
            // console.log(func);
            // console.log('b: ' + b + ' e: ' + e);
            
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
                    func.variable = line.substr(func_start_pos+b-v,v-b-1);
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
					func.variable = func.variable.trim();
                    // console.log('func.variable2: ' + func.variable);
                    var var_param = func.variable.indexOf('[');
                    // if variable is sth like abc[i] it can be an array or a string
                    if (var_param !== -1) {
                        // can be string and array
                        func.variable_type = 'unknown';
                    } else {
                         // try to get the VariableType ('String','Array','RegExp','unknown'
						var varType = getVariableType(content,func.variable,pos);
                        func.variable_type = varType.type;
						if (varType.mod) {
							func.mod = varType.mod;
						}
                    }
                   
                    //console.log('func.variable_type: ' + func.variable_type);
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
			// if func name starts with a letter
			if (func.name.charAt(0).match(/[a-zA-Z]/)) {
            	return func;
			} else {
				return null;
			}
        }
        
        return null;
    }
    
    /**
        get the type of a variable or the module
		it's important for functions which exists for strings and arrays
        @param content  {string} content of document
        @param variable {string} name of the variable
		@param pos {object} current cursor position
        @return object (type of the variable: unknown,String,Array or RegExp, mod: modul name else '')
    */
    function getVariableType (content, variable,pos) {
        // get the declaration for this variable 
        // can be a ',' between two declarations
        var regex = new RegExp('var [^;]*?' + variable + '\\s*?=','');
        var match = regex.exec(content);
     
        if (match) {
            var pos = match.index;
            // length of the match
            var match_len = match[0].length;
        } else {
            // if the declaration is not available in this content
			// could be a function parameter
			// check for requirejs (define)
			var before = content.split("\n",pos.line);
			var defineBool = false;
			for(var i = 0; i < before.length; i++) {
				if (before[i].indexOf('define') !== -1) {
					defineBool = true;
					var defineLine = i;
					break;
				}
			}
			if (defineBool) {
				var definePos = content.indexOf('define');
				var define = content.substr(content.indexOf('(',definePos)+1);
				console.log(define);

				var funcLine = false;
				for(var j = defineLine; j < before.length; j++) {
					var funcPos;
					console.log(before[j]);
					if ((funcPos = before[j].indexOf('function')) !== -1) {
						funcLine = j;
						break;
					}
				}
				if (funcLine !== false) {
					var functionLine = before[funcLine];
					console.log(functionLine);
					var paramPos;
					if ((paramPos = functionLine.indexOf(variable)) !== -1) {
						// get the correct require module
						// -> which parameter number?
						var afterFunc = functionLine.substr(funcPos);
						afterFunc = afterFunc.substring(afterFunc.indexOf('(')+1,afterFunc.indexOf(')'));
						var params = afterFunc.split(',');
						console.log(params);
						var paramNr = false;
						for (var p = 0; p < params.length; p++) {
							if (params[p].trim() == variable) {
								paramNr = p;
								break;
							}
						}
					}
				}
				if (paramNr !== false) {
					console.log(paramNr);
					// get the correct module name
					var modulRegEx = /([^,]*?,\s*?\[([^\]]*?)\]|\s*?\[([^\]]*?)\])/gmi;
					var modules = modulRegEx.exec(define);
					var moduleError = false;
					if (modules[2]) {
						modules = modules[2];
					} else if (modules[3]) {
						modules = modules[3];
					} else {
						moduleError = true;
					}
					if (!moduleError) {
						console.log(modules);
						modules = modules.substring(modules.indexOf("'")+1,modules.lastIndexOf("'"));
						console.log(modules);
						// correct module name:
						modules = modules.split(/'\s*?,\s*?'/);
						return {type: 'unknown', mod: modules[paramNr]};
					}
				}
			}


			for (var i = before.length-1; i >= 0; i--) {
				if (before[i].indexOf('function') !== -1) break;
			}
			var functionLine = before[i];
			var regex = /(var (.*)=[ \(]*?function(.*)|function (.*?)|(.*?):\s*?function(.*?)|(.*?)\.prototype\.(.*?)\s*?=\s*?function(.*?))(\n|\r|$)/gmi;

			var matches = null;
			while (matches = regex.exec(functionLine)) {
				// matches[0] = all
				// matches[2] = '''function_name''' or matches[4] if matches[2] undefined or matches[5] if both undefined
				// get the function name
				// start_pos
				if (matches[2]) {
					var match_func = matches[2].trim();
				} else if (matches[4]) {
					var match_func = matches[4].trim();
				} else if (matches[5]) {
					var match_func = matches[5].trim();
				}  else if (matches[8]) {
					var match_func = matches[8].trim();
				} else {
					break;
				}
				var end_func_name = match_func.search(/( |\(|$)/);
				// the variable must be a parameter
				if (match_func.substr(end_func_name).indexOf(variable) !== -1 || (matches[9] && matches[9].indexOf(variable) !== -1)) {
					var match_func = match_func.substring(0,end_func_name).trim();

					var func = {name: match_func};
					if (matches[7]) {
						func.variable_type = matches[7];
					}
					var tags = get_userdefined_tags(content,func);

					if (tags) {
						for (var t = 0; t < tags.p.length; t++) {
							if (tags.p[t].t == variable) {
								var type = tags.p[t].type;
								type = type.substr(0,1).toUpperCase() + type.substr(1);
								return {type:type};
								break;
							}
						}
					}
				}
			}

			return {type:'unknown'};
        }
        


    
        // get declaration value
        // substr(pos).search(regex)+pos = indexOf(regex,pos)
        var value = content.substr(pos+match_len,content.substr(pos+match_len).search(/[;,]/));
        value = value.trim();
        
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
                    return {type:'String'};
                }
                // all functions that outputs an array
                if (',split,match,reverse,sort,map,'.indexOf(','+func+',') !== -1) {
                    return {type:'Array'};
                }
            }
        } else { // if the declaration has no function parts
            // array can be declared with new Array or []
            if (value.indexOf('new Array') !== -1 || (value.substr(0,1) == '[') ) {
                return {type:'Array'};
            }
            if (value.indexOf('new RegExp') !== -1) {
                return {type:'RegExp'};
            }
			if (value.indexOf('this') !== -1) {
				return {type:'this'};
			}

            // checks '/anc/flags' and "/anc/flags" => RegExp
            var regex_end = new RegExp("\/(g|m|i|y){0,4}'");
            var regex_end2 = new RegExp('\/(g|m|i|y){0,4}"');
            if ((value.substr(0,2) == "'/" && value.substr(-6,6).search(regex_end) !== -1) ||
               (value.substr(0,2) == '"/' && value.substr(-6,6).search(regex_end2) !== -1)) {
                return {type:'RegExp'};
            }
            
            // checks 'str' and "str"
            if ((value.substr(0,1) == "'" && value.substr(-1,1) == "'") || (value.substr(0,1) == '"' && value.substr(-1,1) == '"')) {
                return {type:'String'};
            }
        }
        return {type:'unknown'};
    }
    



	/**
    * user defined functions can documentated with JavaDoc
    * @param content
    * @param func       {object}       function (includs func.name)
    * @return tags object
    */
    function get_userdefined_tags(content,func) {
        var tags = new Object();
		// global,multiline,insensitive
        var regex = /\/\*\*(?:[ \t]*)[\n\r](?:[\s\S]*?)\*\/(?:[ \t<]*)[\n\r]*?(?:[ \t]*)(var (.*)=[ \(]*?function(.*)|function (.*?)|(.*?):\s*?function(.*?)|(.*?)\.prototype\.(.*?)\s*?=\s*?function(.*?))(\n|\r|$)/gmi;
      
		var matches = null;

        while (matches = regex.exec(content)) {
			console.log(matches);
            // matches[0] = all
             // matches[2] = '''function_name''' or matches[4] if matches[2] undefined or matches[5] if both undefined
            // get the function name
			// start_pos
			if (matches[2]) {
				var match_func = matches[2].trim();
			} else if (matches[4]) {
				var match_func = matches[4].trim();	
			} else if (matches[5]) {
				var match_func = matches[5].trim();
			}  else if (matches[8]) {
				// prototype
				if (matches[7] == func.variable_type) {
					var match_func = matches[8].trim();
				}
			} else {
				break;
			}
			var end_func_name = match_func.search(/( |\(|$)/);
			var match_func = match_func.substring(0,end_func_name).trim();
            if (match_func === func.name) {
                var lines = matches[0].split(/[\n\r]/);
                // until the first @ it's description 
                // afterwards the description can't start again
                var canbe_des = true; // can be description
                var params = [];
                // first line is /**, and last two ones are */ \n function
                for (var i = 1; i < lines.length-2; i++) {
                    lines[i] = lines[i].trim(); // trim each line
					if (lines[i].substr(0,2) == "*/") break;
                    lines[i] = lines[i].replace(/^\*/,'').trim(); // delete * at the beginning and trim line again
                    
                    // no @ => decription part 
                    if (lines[i].substr(0,1) !== '@' && canbe_des) {
                        if (tags.s && lines[i]) {
                            tags.s += '<br>' + lines[i]; // add to summary part
                        } else if (!tags.s) {
                            tags.s = lines[i];
                        }
                    }
                    tags.y = ''; // syntax is empty for this
                    
                    // get params
                    if (lines[i].substr(0,6) === '@param') {
                        canbe_des = false; // description tag closed
                        var param_parts = lines[i].split(/(?:\s+)/);
                        var param_type = '';

                        // 0 = @param, 1 = title, 2-... = description
                        // 1,2 can be the type (inside {})
						if (param_parts[2]) {
							if (param_parts[1].substr(0,1) == '{' && param_parts[1].substr(-1) == '}') {
								// type is part of the title
								param_parts[1] = param_parts[1].substring(1,param_parts[1].length-1); // remove { }
								var param_title = param_parts[2];
								param_type = param_parts[1];
								var description = param_parts[3];
								var j_start = 4;
							} else 	if (param_parts[2].substr(0,1) == '{' && param_parts[2].substr(-1) == '}') {
								// type is part of the title
								param_parts[2] = param_parts[2].substring(1,param_parts[2].length-1); // remove { }
								var param_title = param_parts[1];
								param_type = param_parts[2];
								var description = param_parts[3];
								var j_start = 4;
							} else {
								var param_title = param_parts[1]; 
								var description = param_parts[2];
								var j_start = 3;
							}
							for (var j = j_start; j < param_parts.length; j++) {
								description += ' ' + param_parts[j];
							}
						} else {
							var param_title = param_parts[1];
							var description = '';	
						}
                        params.push({'t':param_title,'d':description,'type':param_type});
                    }
                    if (lines[i].substr(0,7) === '@return') {
						if (lines[i].substr(0,8) === '@returns') {
							var  return_tag = lines[i].substr(8).trim(); // delete @return and trim
						} else {
                        	var  return_tag = lines[i].substr(7).trim(); // delete @return and trim
						}
						if(return_tag.charAt(0) == '{') {
							var endCurly = return_tag.indexOf('}');
							tags.r = {'d': return_tag.substr(endCurly+1),'type':return_tag.substring(1,endCurly)};
						}else {
							tags.r = return_tag;
						}
                    }
                }
                tags.p = params;
                return tags;
            }
         }
        return null;   
    }
   

	/**
	 * Get the content of a special modul
	 * For that iterate through all js files
	 * @param docDir directory of current document
	 * @param moduleName name of the js module
	 * @param currentModuleName name of the current module
	 * @return content The content of the js module file
	 */
	function getModuleContent(docDir,moduleName,currentModuleName) {
	    function getJSFiles(file) {
            if (file._name.substr(-3) == ".js") return true;
        }
        var result = new $.Deferred();
		console.log(currentModuleName+moduleName+'.js');
        ProjectManager.getAllFiles(getJSFiles)
            .done(function (files) {
				// sort files to make it faster
				// if the js file name contains the module name it's more relevant
				var sortedFilesTop = [];
				var sortedFilesBottom = [];
				var sortedFiles = [];
				var content = false;
				files.forEach(function(file) {
					if (file._path == (currentModuleName+moduleName+'.js')) {
						console.log(file);
						content = getModuleContentIterator(file,moduleName);
						return true;
					}
				});
				if (content) {
					return result.resolve(content);
				}
			})
			.fail(function () {
				result.reject();
			});
		return result.promise();
	}

	/**
	 * Get the content of a special module name
	 * For that iterate through all js files
	 * @param file file by ProjectManager.getAllFiles
	 * @param moduleName name of the js class
	 * @return content The content of the php class file
	 */
	function getModuleContentIterator(file,moduleName) {
		var result = '';
		moduleName = moduleName.addSlashes();
		console.log(moduleName);
		if (file) {
			if (file._isDirectory == false) {
				if (file._name.substr(-3) == ".js") {
					console.log('correctFile: '+file._name);
					if (file._contents) {
						result = file._contents;
					} else {
						var xhr = new XMLHttpRequest();
						// false => synchron
						xhr.open('get',file._path, false);

						// Send the request
						xhr.send(null);

						if(xhr.status === 0){
							var text = xhr.responseText;
							result = text;
						}
					}
				}
			}
		}
		if (result) {
			console.log('moduleContent: '+result);
			return result;
		}
		return false;
	}
    
	/**
	 * Get the directory of the current requirejs module
	 * @param {string} docDir current directory
	 * @param {string} content content of the current file
	 */
	function getCurrentModuleDir(docDir,content) {
		var match = /define\s*?\(\s*?'(.*?)'/gmi;
		var matches = match.exec(content);
		if (matches[1]) {
			var moduleName = matches[1];
			var lastSlash;
			var moduleDir = moduleName.substr(0,((lastSlash = moduleName.lastIndexOf('/')) !== -1) ? lastSlash+1: moduleName.length);
			moduleDir = reverse_str(reverse_str(docDir).replace(reverse_str(moduleDir),''));
			return moduleDir;
		}
		return '';
	}

    /**
        reverse a string
    */
    function reverse_str(s){
        return s.split("").reverse().join("");
    }
    
	String.prototype.addSlashes = function() {
	  return this
		.replace(/([^\\])\//g, '$1\\\/');
	}


    
    EditorManager.registerInlineDocsProvider(inlineProvider); 
});
